import pkg from "voucher-code-generator";
const { generate: generateVoucherCode } = pkg;

import { Collection, Guild, Snowflake, User } from "discord.js";
import Keyv from "@keyvhq/core";
import chalk from "chalk";

import { DatabaseModerationResult } from "../../conversation/moderation/moderation.js";
import { ChatInput } from "../../conversation/conversation.js";
import { ResponseMessage } from "../../chat/types/message.js";
import { ChatOutputImage } from "../../chat/types/image.js";
import { DatabaseImage } from "../../image/types/image.js";
import { GPTDatabaseError } from "../../error/gpt/db.js";
import { BotDiscordClient } from '../../bot/bot.js';
import { DatabaseManager } from "../manager.js";


/* Type of moderation action */
export type DatabaseUserInfractionType = "ban" | "unban" | "warn" | "moderation"

export interface RawDatabaseConversation {
    created: string;
    id: string;
    active: boolean;
    tone: string;
    history: DatabaseConversationMessage[] | null;
}

export interface RawDatabaseGuild {
    id: Snowflake;
    created: string;
    subscription: DatabaseGuildSubscription | null;
}

export interface RawDatabaseUser {
    id: Snowflake;
    created: string;
    moderator: boolean;
    interactions: number;
    infractions: DatabaseUserInfraction[];
    subscription: DatabaseSubscription | null;
    acceptedTerms: boolean;
}

export interface RawDatabaseSubscriptionKey {
    id: string;
    created: string;
    type: DatabaseSubscriptionType;
    duration: number;
    redeemed: DatabaseSubscriptionRedeemStatus | null;
}

export interface DatabaseUserInfraction {
    /* Type of moderation action */
    type: DatabaseUserInfractionType;

    /* When this action was taken */
    when: number;

    /* Which bot moderator took this action, Discord identifier */
    by?: Snowflake;

    /* Why this action was taken */
    reason?: string;

    /* Whether the user has been notified of this infraction */
    seen?: boolean;

    /* Used for `moderation` infractions */
    moderation?: DatabaseModerationResult;
    automatic?: boolean;
}

type DatabaseInfractionOptions = Pick<DatabaseUserInfraction, "by" | "reason" | "type" | "moderation" | "automatic">

export type DatabaseSubscriptionType = "guild" | "user";

export interface DatabaseSubscriptionRedeemStatus {
    /* Who redeemed this key */
    who: Snowflake;

    /* When did they redeem this key */
    when: number;

    /* Optional, for guilds; which guild this key was redeemed for */
    guild?: Snowflake;
}

export interface DatabaseSubscriptionKey {
    /* The subscription redeem key itself */
    id: string;

    /* When the key was created */
    created: number;

    /* How long the key lasts */
    duration: number;

    /* Type of key */
    type: DatabaseSubscriptionType;

    /* Information about who redeemed this key, etc. */
    redeemed: DatabaseSubscriptionRedeemStatus | null;
}

export interface DatabaseSubscription {
    /* Since when the user has an active subscription */
    since: number;

    /* When this premium subscription expires */
    expires: number;

    /* Which key was used to redeem this subscription */
    key?: string;
}

export type DatabaseGuildSubscription = DatabaseSubscription & {
    /* Who redeemed the subscription key for the server */
    by: Snowflake;
}

export interface DatabaseGuild {
    /* Identifier of the Discord guild */
    id: Snowflake;

    /* When the guild was added to the database */
    created: number;

    /* Information about the guild's subscription */
    subscription: DatabaseGuildSubscription | null;
}

export interface DatabaseUser {
    /* Discord ID of the user */
    id: Snowflake;

    /* When the user first interacted with the bot */
    created: number;
    
    /* Whether the user is a moderator of the bot */
    moderator: boolean;

    /* How many interactions the user has with the bot */
    interactions: number;

    /* Moderation history of the user */
    infractions: DatabaseUserInfraction[];

    /* Information about the user's subscription status */
    subscription: DatabaseSubscription | null;

    /* Whether the user has accepted the Terms of Service */
    acceptedTerms: boolean;
}

export interface DatabaseInfo {
    user: DatabaseUser;
    guild?: DatabaseGuild | null;
}

export type DatabaseOutputImage = Omit<ChatOutputImage, "data"> & {
    data: string;
} 

export type DatabaseResponseMessage = Pick<ResponseMessage, "id" | "raw" | "text" | "type"> & {
    images: DatabaseOutputImage[];
}

export interface DatabaseConversationMessage {
    id: string;

    output: DatabaseResponseMessage;
    input: ChatInput;
}

export interface DatabaseConversation {
    created: number;
    id: string;
    active: boolean;
    tone: string;
    history: DatabaseConversationMessage[] | null;
}

export interface DatabaseMessage {
    id: string;
    requestedAt: string;
    completedAt: string;
    input: ChatInput;
    output: DatabaseResponseMessage;
    tone: string;
}

type DatabaseAll = DatabaseUser | DatabaseConversation | DatabaseGuild | DatabaseMessage | DatabaseImage | DatabaseSubscriptionKey;

export type DatabaseCollectionType = "users" | "conversations" | "guilds" | "interactions" | "images" | "keys"

/* How long to cache entries for */
const DB_CACHE_DURATION: number = 1 * 60 * 60 * 1000;

/* How often to save cached entries to the database */
const DB_CACHE_INTERVAL: number = 5 * 1000;

export class UserManager {
    private readonly db: DatabaseManager;

    /* Cache with all database users, to reduce API calls */
    public cache: {
        users: Keyv<DatabaseUser>;
        conversations: Keyv<DatabaseConversation>;
        guilds: Keyv<DatabaseGuild>;
        images: Keyv<DatabaseImage>;
        keys: Keyv<DatabaseSubscriptionKey>;
    };

    /* Cache with all database users, to reduce API calls */
    public updates: {
        users: Collection<string, DatabaseUser>;
        conversations: Collection<string, DatabaseConversation>;
        guilds: Collection<string, DatabaseGuild>;
        interactions: Collection<string, DatabaseMessage>;
        images: Collection<string, DatabaseImage>;
        keys: Collection<string, DatabaseSubscriptionKey>;
    };

    constructor(db: DatabaseManager) {
        this.db = db;

        /* Update collection types */
        const updateCollections: (keyof typeof this.updates)[] = [ "users", "conversations", "guilds", "interactions", "images", "keys" ];
        const updates: Partial<typeof this.updates> = {};

        /* Cache collection types */
        const cacheStores: (keyof typeof this.cache)[] = [ "conversations", "guilds", "images", "keys", "users" ];
        const cache: Partial<typeof this.cache> = {};

        /* Create all cache stores. */
        for (const store of cacheStores) {
            cache[store] = new Keyv<any>({
                namespace: store
            });
        }

        /* Create all update collections. */
        for (const type of updateCollections) {
            updates[type] = new Collection<string, any>();
        }

        this.updates = updates as typeof this.updates;
        this.cache = cache as typeof this.cache;
    }

    public async setup(): Promise<void> {
        setInterval(async () => {
            if (this.db.bot.started) await this.workOnQueue().catch(() => {});
        }, DB_CACHE_INTERVAL);
    }

    /**
     * Create a suitable database user entry for Supabase.
     * @param user Discord user to create
     * 
     * @returns Created database entry
     */
    private userTemplate(user: User): DatabaseUser {
        return {
            id: user.id,
            created: Date.now(),
            infractions: [],
            interactions: 0,
            moderator: this.db.bot.app.config.discord.owner.includes(user.id),
            acceptedTerms: false,
            subscription: null
        };
    }

    private rawToUser(raw: RawDatabaseUser): DatabaseUser {
        return {
            created: Date.parse(raw.created),
            id: raw.id,
            interactions: raw.interactions,
            infractions: raw.infractions,
            moderator: raw.moderator,
            subscription: raw.subscription,
            acceptedTerms: raw.acceptedTerms
        };
    }

    /**
     * Create the specified Discord user in the database.
     * @param user User to add to the database
     */
    private async createUser(user: User): Promise<DatabaseUser> {
        const template: DatabaseUser = this.userTemplate(user);

        await this.addUserToQueue(user.id, template);
        return template;
    }

    public async getUser(user: User | Snowflake): Promise<DatabaseUser | null> {
        if (await this.cache.users.get(typeof user === "string" ? user : user.id) !== undefined) return (await this.cache.users.get(typeof user === "string" ? user : user.id))!;
         
        const { data, error } = await this.db.client
            .from(this.collectionName("users")).select("*")
            .eq("id", typeof user === "string" ? user : user.id);

        if (error !== null || data === null || data.length === 0) return null;
        return this.rawToUser(data[0] as any);
    }

    public async getImage(id: string): Promise<DatabaseImage | null> {
        if (await this.cache.images.get(id) !== undefined) return (await this.cache.images.get(id))!;
         
        const { data, error } = await this.db.client
            .from(this.collectionName("images")).select("*")
            .eq("id", id);

        if (error !== null) throw new GPTDatabaseError({ collection: "users", raw: error });
        if (data === null || data.length === 0) return null;

        this.setImageCache(data[0] as any);
        return data[0] as any;
    }

    /**
     * Ensure that a database entry exists for the specified user, and return it.
     * @param user User to ensure database entry for
     * 
     * @returns Database entry
     */
    public async fetchUser(user: User): Promise<DatabaseUser> {
        const data: DatabaseUser | null = await this.getUser(user) || await this.createUser(user);

        /* Validate the user's subscription. */
        data.subscription = await this.subscription(data, "user");

        if (await this.cache.users.get(user.id) == undefined) await this.setUserCache(user.id, data);
        return data;
    }


    private guildTemplate(guild: Guild): DatabaseGuild {
        return {
            id: guild.id,
            created: Date.now(),
            subscription: null
        };
    }

    private rawToGuild(guild: RawDatabaseGuild): DatabaseGuild {
        return {
            created: Date.parse(guild.created),
            id: guild.id,
            subscription: guild.subscription
        };
    }

    private async createGuild(guild: Guild): Promise<DatabaseGuild> {
        const template: DatabaseGuild = this.guildTemplate(guild);

        await this.addGuildToQueue(guild.id, template);
        return template;
    }

    public async getGuild(guild: Guild): Promise<DatabaseGuild | null> {
        if (await this.cache.guilds.get(guild.id) !== undefined) return (await this.cache.guilds.get(guild.id))!;
         
        const { data, error } = await this.db.client
            .from(this.collectionName("guilds")).select("*")
            .eq("id", guild.id);

        if (error !== null) throw new GPTDatabaseError({ collection: "guilds", raw: error });
        if (data === null || data.length === 0) return null;

        return this.rawToGuild(data[0] as any);
    }

    public async fetchGuild(guild: Guild): Promise<DatabaseGuild> {
        const data: DatabaseGuild | null = await this.getGuild(guild) || await this.createGuild(guild);

        /* Validate the guild's subscription. */
        data.subscription = await this.subscription(data, "guild") as DatabaseGuildSubscription;

        if (await this.cache.guilds.get(guild.id) == undefined) await this.setGuildCache(guild.id, data);
        return data;
    }


    public async fetchData(user: User, guild: Guild | null | undefined): Promise<DatabaseInfo> {
        return {
            user: await this.fetchUser(user),
            guild: guild ? await this.fetchGuild(guild) : null
        };
    }

    /**
     * Check whether the specified database user is banned.
     * @param user Database user to check
     * 
     * @returns Whether they are banned
     */
    public banned(user: DatabaseUser): DatabaseUserInfraction | null {
        /* List of all ban-related infractions */
        const infractions: DatabaseUserInfraction[] = user.infractions.filter(i => i.type === "ban" || i.type === "unban");
        if (user.infractions.length === 0) return null;

        /* Whether the user is banned; really dumb way of checking it */
        const banned: boolean = infractions.length % 2 > 0;
        return banned ? infractions[infractions.length - 1] : null;
    }

    /**
     * Give an infraction of the specified type to a user.
     * 
     * @param user User to give the infraction to
     * @param options Infraction options
     */
    private async infraction(user: DatabaseUser, { by, reason, type, seen, moderation, automatic }: DatabaseInfractionOptions & { seen?: boolean }): Promise<void> {
        /* Raw infraction data */
        const data: DatabaseUserInfraction = {
            by, reason, type, moderation, automatic,
            when: Date.now()
        };

        if (type !== "moderation" && type !== "ban" && type !== "unban") data.seen = seen ?? false;

        /* Update the user cache too. */
        await this.addUserToQueue(user, {
            infractions: [
                ...(await this.getUser(user.id))!.infractions,
                data
            ]
        });
    }

    public async flag(user: DatabaseUser, data: DatabaseModerationResult): Promise<void> {
        return this.infraction(user, { type: "moderation", moderation: data });   
    }

    public async warn(user: DatabaseUser, { by, reason, automatic }: Pick<DatabaseInfractionOptions, "reason" | "by" | "automatic">): Promise<void> {
        return this.infraction(user, { by, reason: reason ?? "Inappropriate use of the bot", type: "warn", seen: false, automatic: automatic });
    }

    public async ban(user: DatabaseUser, { by, reason, status, automatic  }: Pick<DatabaseInfractionOptions, "reason" | "by" | "automatic"> & { status: boolean }): Promise<void> {
        if (this.banned(user) && status) return;
        else if (!this.banned(user) && !status) return;

        return this.infraction(user, { by, reason: reason ?? "Inappropriate use of the bot", type: status ? "ban" : "unban", automatic });
    }

    /**
     * Mark the specified infractions as `seen`.
     * 
     * @param user User to mark the infractions as `seen` for
     * @param marked Infractions to mark as `seen`
     */
    public async read(user: DatabaseUser, marked: DatabaseUserInfraction[]): Promise<void> {
        let arr: DatabaseUserInfraction[] = user.infractions;

        /* Loop through the user's infractions, and when the infractions that should be marked as read were found, change their `seen` status. */
        arr = arr.map(
            i => marked.find(m => m.when === i.when) !== undefined ? { ...i, seen: true } : i
        );

        /* Update the user cache too. */
        await this.addUserToQueue(user, { infractions: arr });
    }

    public unread(user: DatabaseUser): DatabaseUserInfraction[] {
        return user.infractions.filter(i => i.type === "warn" && i.seen === false);
    }

    /**
     * Increment the user's amount of interactions with the bot.
     * @param user User to increment interaction count for
     */
    public async incrementInteractions(user: DatabaseUser): Promise<void> {
        const updated: number = user.interactions + 1;

        /* Update the user cache too. */
        await this.addUserToQueue(user, { interactions: updated });
    }

    public async updateModeratorStatus(user: DatabaseUser, status: boolean): Promise<void> {
        return await this.addUserToQueue(user, {
            moderator: status
        });
    }

    public subscriptionIcon({ user, guild }: DatabaseInfo): "✨" | "💫" | "👤" {
        if (user.subscription !== null) return "✨";
        if (guild && guild.subscription !== null) return "💫";

        return "👤";
    }

    public subscriptionType({ user, guild }: DatabaseInfo): "UserPremium" | "GuildPremium" | "Free" {
        if (user.subscription !== null) return "UserPremium";
        if (guild && guild.subscription !== null) return "GuildPremium";

        return "Free";
    }

    public canUsePremiumFeatures({ user, guild }: DatabaseInfo): boolean {
        return (guild && guild.subscription !== null) || user.subscription !== null;
    }

    /**
     * Get information about the user/guild's current subscription, if available.
     * @param db User/guild to get subscription for
     * 
     * @returns User/guild's current subscription, if available
     */
    private async subscription(db: DatabaseUser | DatabaseGuild, type: DatabaseSubscriptionType = "user"): Promise<DatabaseSubscription | DatabaseGuildSubscription | null> {
        if (db.subscription === null) return null;

        /* If the user's subscription expired, reset it in the database too. */
        if (db.subscription !== null && Date.now() > db.subscription.expires)  {
            //if (type === "user") await this.addUserToQueue(db as DatabaseUser, { subscription: null });
            //else if (type === "guild") await this.addGuildToQueue(db as DatabaseGuild, { subscription: null });

            return null;
        }

        return db.subscription;
    }

    /**
     * Grant the specified user a subscription.
     * 
     * @param user User to grant subscription
     * @param expires When the subscription should expire
     */
    public async grantSubscription(user: DatabaseUser | DatabaseGuild, type: DatabaseSubscriptionType, expires: number, by?: Snowflake, key?: DatabaseSubscriptionKey): Promise<void> {
        const updated: DatabaseSubscription | DatabaseGuildSubscription = {
            since: user.subscription !== null ? user.subscription.since : Date.now(),
            expires: (user.subscription ? user.subscription.expires - Date.now() : 0) + Date.now() + expires,
            key: key ? key.id : undefined
        };

        if (type === "guild") (updated as DatabaseGuildSubscription).by = by!;

        if (type === "user") return this.addUserToQueue(user as DatabaseUser, { subscription: updated });
        else if (type === "guild") return this.addGuildToQueue(user as DatabaseGuild, { subscription: updated as DatabaseGuildSubscription });
    }

    /**
     * Revoke the specified user's active subscription.
     * @param user User to revoke subscription
     */
    public async revokeSubscription(user: DatabaseUser | DatabaseGuild, type: DatabaseSubscriptionType): Promise<void> {
        if (type === "user") return this.addUserToQueue(user as DatabaseUser, { subscription: null });
        else if (type === "guild") return this.addGuildToQueue(user as DatabaseGuild, { subscription: null });
    }

    private rawToSubscriptionKey(key: RawDatabaseSubscriptionKey): DatabaseSubscriptionKey {
        return {
            created: Date.parse(key.created),
            duration: key.duration,
            redeemed: key.redeemed,
            type: key.type,
            id: key.id
        };
    }

    public async getSubscriptionKey(key: string): Promise<DatabaseSubscriptionKey | null> {
        if (await this.cache.keys.get(key) !== undefined) return (await this.cache.keys.get(key))!;
         
        const { data, error } = await this.db.client
            .from(this.collectionName("keys")).select("*")
            .eq("id", key);

        if (error !== null || data === null || data.length === 0) return null;
        return this.rawToSubscriptionKey(data[0] as any);
    }

    /**
     * Generate the specified amount of subscription keys, and add them to the database.
     * @param count How many keys to generate
     * 
     * @returns The generated keys
     */
    public async generateSubscriptionKeys(count: number = 1, type: DatabaseSubscriptionType = "user", duration: number = 30 * 24 * 60 * 60 * 1000): Promise<DatabaseSubscriptionKey[]> {
        /* Generate the voucher codes itself. */
        const rawCodes: string[] = generateVoucherCode({
            pattern: "####-####-####",
            count
        });

        /* Create the subscription keys. */
        const keys: DatabaseSubscriptionKey[] = rawCodes.map(code => ({
            created: Date.now(),
            id: code, type,

            duration: duration,
            redeemed: null
        }));

        /* Add all of the keys to the queue & cache. */
        await Promise.all(keys.map(key => this.addSubscriptionKeyToQueue(key.id, key)));

        return keys;
    }

    public async findSubscriptionKey(key: string): Promise<DatabaseSubscriptionKey | null> {
        const data: DatabaseSubscriptionKey | null = await this.getSubscriptionKey(key);

        if (data === null) return null;
        return data;
    }

    /**
     * Redeem the specified key, for the user.
     * 
     * @param user User to redeem the key for
     * @param key Key to redeem
     */
    public async redeemSubscriptionKey(user: DatabaseUser | DatabaseGuild, key: DatabaseSubscriptionKey, by?: Snowflake): Promise<void> {
        /* Invalidate the key from the database. */
        await this.addSubscriptionKeyToQueue(key.id, {
            ...key,

            redeemed: {
                when: Date.now(),
                who: key.type === "user" ? user.id : by!,
                guild: key.type === "guild" ? user.id : undefined
            }
        });

        /* Grant the subscription to the user. */
        await this.grantSubscription(user, key.type, key.duration, by, key);
    }

    public rawToConversation(data: RawDatabaseConversation): DatabaseConversation {
        return {
            ...data,
            created: Date.parse(data.created)
        };
    }

    /**
     * Clear the caches entirely.
     */
    public async clearCache(): Promise<void> {
        this.cache.conversations.clear();
        this.cache.users.clear();
    }

    public async setCache(type: keyof typeof this.cache, obj: DatabaseAll | Snowflake, updates: Partial<DatabaseAll> | DatabaseAll = {}, duration: number = DB_CACHE_DURATION): Promise<void> {
        let updated: DatabaseAll;
        const existing: DatabaseAll | null = await this.cache.users.get(typeof obj === "string" ? obj : obj.id) ?? null;

        if (typeof obj === "string") updated = updates as DatabaseAll;
        else updated = { ...existing !== null ? existing : obj, ...updates as DatabaseAll };

        /* Update the cache for this cluster directly. */
        await this.cache[type].set(typeof obj === "string" ? obj : obj.id, updated as any, duration);

        /* Set the cache for every cluster. */
        this.db.bot.client.cluster.broadcastEval((async (client: BotDiscordClient, context: { id: Snowflake; type: string; updated: DatabaseAll; duration: number }) => {
            await client.bot.db.users.cache[context.type as keyof { users: Keyv<DatabaseUser>; conversations: Keyv<DatabaseConversation>; guilds: Keyv<DatabaseGuild>; }].set(context.id, context.updated as any, context.duration);
        }) as any, {
            context: {
                id: typeof obj === "string" ? obj : obj.id,
                updated: updated,
                type: type,

                duration: duration
            }
        }).catch(() => {});
    }

    public async setUserCache(user: DatabaseUser | Snowflake, updates?: Partial<DatabaseUser> | DatabaseUser): Promise<void> {
        return this.setCache("users", user, updates);
    }

    public async setConversationCache(conversation: DatabaseConversation | Snowflake, updates?: Partial<DatabaseConversation> | DatabaseConversation): Promise<void> {
        return this.setCache("conversations", conversation, updates);
    }

    public async setGuildCache(guild: DatabaseGuild | Snowflake, updates?: Partial<DatabaseGuild> | DatabaseGuild): Promise<void> {
        return this.setCache("guilds", guild, updates);
    }

    public async setImageCache(image: DatabaseImage, updates?: Partial<DatabaseImage> | DatabaseImage): Promise<void> {
        return this.setCache("images", image, updates, Math.floor(DB_CACHE_DURATION / 2));
    }

    private async addToQueue(type: keyof typeof this.updates, obj: DatabaseAll | Snowflake, updates: Partial<DatabaseAll> | DatabaseAll): Promise<void> {
        const id: Snowflake = typeof obj === "string" ? obj : obj.id;

        const existing: DatabaseAll | null = this.updates[type].get(id) ?? null;
        let updated: DatabaseAll;

        if (typeof obj === "string") updated = updates as DatabaseAll;
        else updated = { ...existing !== null ? existing : {}, ...updates as DatabaseAll };

        this.updates[type].set(id, updated as any);
    }

    public async addUserToQueue(user: DatabaseUser | Snowflake, updates: Partial<DatabaseUser> | DatabaseUser): Promise<void> {
        await Promise.all([
            this.setCache("users", user, updates),
            this.addToQueue("users", user, updates)
        ]);
    }

    public async addGuildToQueue(guild: DatabaseGuild | Snowflake, updates: Partial<DatabaseGuild> | DatabaseGuild): Promise<void> {
        await Promise.all([
            this.setCache("guilds", guild, updates),
            this.addToQueue("guilds", guild, updates)
        ]);
    }

    public async addConversationToQueue(conversation: DatabaseConversation | Snowflake, updates: Partial<DatabaseConversation> | DatabaseConversation): Promise<void> {
        const previous: DatabaseConversation | null =
            await this.cache.conversations.get(typeof conversation === "string" ? conversation : conversation.id)
            ?? null;

        await Promise.all([
            this.setCache("conversations", conversation, { ...previous !== null ? previous : {}, ...updates }),
            this.addToQueue("conversations", conversation, { ...previous !== null ? previous : {}, ...updates })
        ]);
    }

    public async addMessageToQueue(message: DatabaseMessage): Promise<void> {
        await this.addToQueue("interactions", message.id, message);
    }

    public async addImageToQueue(image: DatabaseImage): Promise<void> {
        /* Remove the `url` property from all image generation results, as it expires anyway. */
        const data: DatabaseImage = {
            ...image,

            results: image.results.map(
                ({ censored, id, seed }) => ({ censored, id, seed })
            ) as any
        };

        await this.setImageCache(data);
        await this.addToQueue("images", image.id, data);
    }

    public async addSubscriptionKeyToQueue(key: DatabaseSubscriptionKey | string, updates: Partial<DatabaseSubscriptionKey> | DatabaseSubscriptionKey): Promise<void> {
        await Promise.all([
            await this.setCache("keys", key, updates),
            await this.addToQueue("keys", key, updates)
        ]);
    }

    public async workOnQueue(): Promise<void> {
        for (const type of Object.keys(this.updates) as (keyof typeof this.updates)[]) {
            const collection: Collection<string, DatabaseAll> = this.updates[type];
            const entries: [ string, DatabaseAll ][] = Array.from(collection.entries());

            /* Entries to work on */
            const changes: DatabaseAll[] = entries.map(([ id, update ]) => update);
            if (changes.length === 0) continue;

            /* Apply the changes to the database. */
            await Promise.all(changes.map(async (e, i) => {
                const id: string = entries[i][0];

                const { error } = await this.db.client
                    .from(this.collectionName(type))
                    .upsert({
                            id,
                            ...e as any,

                            created: (e as any).created ? new Date((e as any).created).toISOString() : undefined
                    }, { onConflict: "id" });

                /* If an error occured, log it to the console. */
                if (error !== null) {
                    this.db.bot.logger.error(`Something went wrong while trying to save ${chalk.bold(id)} to collection ${chalk.bold(type)} ->`, error);

                /* If the request worked, remove it from the queued changes collection.

                   We only actually remove the changes from the database if they don't fail,
                   otherwise the database and cache won't match up anymore, which will cause data loss. */
                } else if (error === null) {
                    if (this.db.bot.dev) this.db.bot.logger.debug(
                        chalk.bold("Database update"),
                        `-> collection ${chalk.bold(type)}`,
                        `-> ID ${chalk.bold(id)}`,
                        `-> changes:`, JSON.stringify({
                            id: entries[i][0],
                            ...e as any,
    
                            created: (e as any).created ? new Date((e as any).created).toISOString() : undefined
                        }, undefined, 4)
                        );

                    this.updates[type].delete(id);
                }
            }));
        }
    }

    public collectionName(type: DatabaseCollectionType): string {
        return this.db.bot.app.config.db.supabase.collections[type];
    }
}