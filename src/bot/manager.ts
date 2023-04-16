import { Collection, ColorResolvable, EmbedBuilder, REST, Routes } from "discord.js";
import { Cluster, ClusterManager, ReClusterManager } from "discord-hybrid-sharding";
import { EventEmitter } from "node:events";
import chalk from "chalk";

import { App, StrippedApp } from "../app.js";
import { Bot, BotStatus } from "./bot.js";

export interface BotData {
    /* Stripped-down app information */
    app: StrippedApp;
    
    /* Cluster identifier */
    id: number;
}

enum DiscordWebhookAnnounceType {
    /** The bot was started successfully */
    StartBot,

    /** The bot crashed */
    CrashBot,

    /** A cluster was started successfully */
    StartCluster,

    /** A cluster was stopped */
    StopCluster
}

const DiscordWebhookAnnounceTypeMap: { [key: number]: string } = {
    [DiscordWebhookAnnounceType.StartBot]: "Bot is online 🟢",
    [DiscordWebhookAnnounceType.CrashBot]: "Bot has crashed 🔴",
    [DiscordWebhookAnnounceType.StartCluster]: "Cluster #% has started 🟢",
    [DiscordWebhookAnnounceType.StopCluster]: "Cluster #% has stopped 🔴"
}

const DiscordWebhookAnnounceColorMap: { [key: number]: ColorResolvable } = {
    [DiscordWebhookAnnounceType.StartBot]: "Green",
    [DiscordWebhookAnnounceType.CrashBot]: "Red",
    [DiscordWebhookAnnounceType.StartCluster]: "Green",
    [DiscordWebhookAnnounceType.StopCluster]: "Red"
}

export type BotClusterManager = ClusterManager & {
    bot: BotManager;
}

export declare interface BotManager {
    on(event: "create", listener: (bot: Bot) => void): this;
}

export class BotManager extends EventEmitter {
    private readonly app: App;

    /* Discord cluster sharding manager */
    private manager: BotClusterManager | null;

    /* Collection of active clusters */
    public clusters: Collection<number, Cluster>;

    /* Discord REST client, to announce cluster updates */
    public rest: REST;

    /* Status of the bot */
    public status: BotStatus;

    /* Whether all clusters have started */
    public started: boolean;

    constructor(app: App) {
        super();
        this.app = app;

        this.started = false;
        this.rest = null!;

        /* Initialize the cluster sharding manager. */
        this.clusters = new Collection();
        this.manager = null;

        this.status = {
            type: "operational",
            since: Date.now()
        };
    }

    private formatWebhookEmbed(type: DiscordWebhookAnnounceType, cluster?: Cluster): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle(DiscordWebhookAnnounceTypeMap[type].replaceAll("%", (cluster !== undefined ? cluster.id + 1 : -1).toString()))
            .setColor(DiscordWebhookAnnounceColorMap[type])
            .setTimestamp();
    }

    /**
     * Announce a cluster start/crash/update to a Discord webhook.
     * 
     * @param type Type of announcement
     * @param cluster Cluster that was affected, optional
     */
    private async announce(type: DiscordWebhookAnnounceType, cluster?: Cluster): Promise<void> {
        /* Create the initial embed. */
        const embed = this.formatWebhookEmbed(type, cluster);

        await this.rest.post(Routes.channelMessages(this.app.config.channels.status.channel), {
            body: {
                embeds: [ embed.toJSON() ]
            }
        }).catch(() => {});
    }

    /**
     * Internal event, called when a cluster child process dies
     * 
     * @param cluster Cluster that exited
     */
    private async onDeath(cluster: Cluster): Promise<void> {
        this.app.logger.error(`Cluster ${chalk.bold(`#${cluster.id + 1}`)} experienced an error, attempting to restart.`);
        this.announce(DiscordWebhookAnnounceType.StopCluster, cluster);

        this.manager!.queue.next();

        /* Try to respawn the dead cluster, and then mark it as initialized again. */
        await this.onCreate(cluster).then(() => this.sendDone([ cluster ]));
        
    }

    /**
     * Internal event, called when a cluster gets initialized
     * @param cluster Cluster that was started
     */
    private async onCreate(cluster: Cluster): Promise<void> {
        /* Wait for the cluster to get launched, before we proceed. */
        await new Promise<void>(resolve => cluster.once("spawn", () => resolve()));

        /* Add the cluster to the collection. */
        this.clusters.set(cluster.id, cluster);

        /* Catch the exit of the cluster child process. */
        cluster.once("death", async (cluster) => await this.onDeath(cluster));

        /* Send all necessary data to the cluster worker. */
        await cluster.send({
            content: {
                app: this.app.strip(),
                id: cluster.id
            } as BotData
        });

        await this.onReady(cluster);
        if (this.started) await this.sendDone([ cluster ]);
    }

    /**
     * Internal event, called when a cluster's client is marked as ready
     * @param cluster Cluster that was initialized
     */
    private async onReady(cluster: Cluster): Promise<void> {
        /* Check whether this is the "initial" start of the cluster, when the cluster manager gets initialized, or if the cluster was restarted. */
        if (cluster.restarts.current > 0) await this.announce(DiscordWebhookAnnounceType.StartCluster, cluster);
    }

    /**
     * Emit to all or the specified clusters that the starting process is over.
     */
    private async sendDone(clusters?: Cluster[]): Promise<void> {
        return void await Promise.all((clusters ?? Array.from(this.clusters.values())).map(cluster => cluster.send({
            content: "done"
        })));
    }

    /**
     * Handler, for when the cluster manager crashes
     */
    private crashed(error: Error): void {
        this.app.logger.error(chalk.bold("The application crashed, with error ->"), error);

        this.announce(DiscordWebhookAnnounceType.CrashBot)
            .then(() => process.exit(1));
        // process.exit(1);
    }

    /**
     * Set up the cluster sharding manager.
     */
    public async setup(): Promise<void> {
        const now: number = Date.now();

        /* Set up the Discord REST API client. */
        this.rest = new REST({
            version: "10"
        }).setToken(this.app.config.discord.token);

        /* Set up the crash handler. */
        process.on("unhandledRejection", reason => this.crashed(reason as Error));
        process.on("uncaughtException", error => this.crashed(error));

        /* Initialize the cluster sharding manager. */
        this.manager = new ClusterManager("build/bot/bot.js", {
            totalClusters: this.app.config.clusters as number | "auto",
            shardsPerClusters: typeof this.app.config.shardsPerCluster === "string" ? undefined : this.app.config.shardsPerCluster,

            token: this.app.config.discord.token,
            
            mode: "worker",
            respawn: true,

            restarts: {
                interval: 60 * 60 * 1000,
                max: 50
            }
        }) as BotClusterManager;

        /* Add this manager instance to the cluster manager. */
        this.manager.bot = this;

        /* Set up event handling. */
        this.manager.on("clusterCreate", cluster => this.onCreate(cluster));

        /* Launch the actual sharding manager. */
        await this.manager.spawn({
            /* Reduce the delay between the initialization of clusters, to improve startup time. */
            timeout: -1,
            delay: 7 * 1000
        })
			.catch(error => {
				this.app.logger.error(`Failed to set up cluster manager ->`, error);
				this.app.stop(1);
			});

        /* Calculate, how long it took to start all clusters. */
        const time: number = Date.now() - now;

        /* Emit to all clusters that the starting process is over. */
        await this.sendDone();

        this.app.logger.debug(`It took ${chalk.bold(`${(time / 1000).toFixed(2)}s`)} for ${`${chalk.bold(this.clusters.size)} cluster${this.clusters.size > 1 ? "s" : ""}`} to be initialized.`);
        this.app.logger.info("Up n' running!");

        if (!this.app.config.dev) await this.announce(DiscordWebhookAnnounceType.StartBot);
        this.started = true;

        setInterval(() => {
            /* If a new cluster spawn was queued, work on it immediately. */
            if (this.manager!.queue.queue.length > 0) {
                this.manager!.queue.resume();
                this.manager!.queue.next();
            }
        }, 5000);
    }
}