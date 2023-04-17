import chalk from "chalk";

import { DatabaseCollectionType } from "./user.js";
import { DatabaseManager } from "../manager.js";

export class CacheManager {
    private db: DatabaseManager;

    constructor(db: DatabaseManager) {
        this.db = db;
    }

    public async set(
        collection: DatabaseCollectionType,
        key: string,
        value: any[] | { [key: string]: any }
    ): Promise<void> {
        if (this.db.bot.dev) this.db.bot.logger.debug("Cache set ->", chalk.bold(collection), "->", chalk.bold(key));
        this.db.bot.turing.setCache(this.keyName(collection, key), JSON.stringify(value));
    }

    public async get<T>(
        collection: DatabaseCollectionType,
        key: string
    ): Promise<T> {
        if (this.db.bot.dev) this.db.bot.logger.debug("Cache get ->", chalk.bold(collection), "->", chalk.bold(key));

        const raw: string = await this.db.bot.turing.getCache(this.keyName(collection, key));
        return JSON.parse(raw);
    }

    public async delete(
        collection: DatabaseCollectionType,
        key: string
    ): Promise<void> {
        /* TODO */
    }

    private keyName(collection: DatabaseCollectionType, key: string): string {
        return `${collection}-${key}-3`;
    }
}