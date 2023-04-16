import { ContextMenuCommandBuilder, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from "@discordjs/builders";
import { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";
import { APIApplicationCommandOptionChoice } from "discord-api-types/v10";

import { DatabaseInfo } from "../db/managers/user.js";
import { Response } from "./response.js";
import { Bot } from "../bot/bot.js";

export type CommandBuilder = 
	SlashCommandBuilder
	| Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">
	| SlashCommandSubcommandsOnlyBuilder
	| ContextMenuCommandBuilder;

export type CommandInteraction = ChatInputCommandInteraction;
export type CommandOptionChoice<T = string | number> = APIApplicationCommandOptionChoice<T>;

export type CommandResponse = Promise<Response | undefined>;

export enum CommandPrivateType {
	/* The command can only be used by moderators & the owner; it is restricted to the development server */
	ModeratorOnly = "mod",

	/* The command can only be used by the owner; it is restricted to the development server */
	OwnerOnly = "owner"
}

export type CommandCooldown = number | {
	Free: number;
	GuildPremium: number;
	UserPremium: number;
}

export interface CommandOptions {
    /* Whether the command may take longer than 3 seconds (the default limit) to execute */
    long?: boolean;

	/* How long the cool-down between executions of the command should be */
	cooldown?: CommandCooldown | null;

	/* Whether the command works when someone is banned from the bot */
	always?: boolean;

	/* Whether the command should be restricted to the development server */
	private?: CommandPrivateType;
}

export class Command<U extends CommandInteraction = CommandInteraction, T extends CommandOptions = CommandOptions> {
    protected readonly bot: Bot;

	/* Data of the command */
	public readonly builder: CommandBuilder;

    /* Other command options */
    public readonly options: T;

	constructor(bot: Bot, builder: CommandBuilder, options?: T, defaultOptions: T = { long: false, cooldown: null, private: undefined } as any) {
		this.bot = bot;
		this.builder = builder;

        this.options = {
			...defaultOptions,
			...options ?? {}
		};
	}

	/* Respond to auto-completion requests. */
	public async complete(interaction: AutocompleteInteraction): Promise<CommandOptionChoice[]> {
		return [];
	}

	/* Run the command. */
	public async run(interaction: U, user: DatabaseInfo): CommandResponse {
		/* Stub */
		return;
	}
}