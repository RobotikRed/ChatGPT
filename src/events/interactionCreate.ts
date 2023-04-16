import { Interaction, ChatInputCommandInteraction, ButtonInteraction, AutocompleteInteraction } from "discord.js";

import { handleModerationInteraction } from "../util/moderation/moderation.js";
import { handleError } from "../util/moderation/error.js";
import ToneCommand from "../commands/tone.js";
import { Event } from "../event/event.js";
import { Bot } from "../bot/bot.js";
import { handleIntroductionPageSwitch } from "../util/introduction.js";


export default class InteractionCreateEvent extends Event {
	constructor(bot: Bot) {
		super(bot, "interactionCreate");
	}

	public async run(interaction: Interaction): Promise<void> {
		/* If the interaction most likely already expired, don't bother replying to it. */
		if (Date.now() - (interaction.createdTimestamp + 3000) >= 3000) return;

		try {
			if (interaction.isChatInputCommand()) {
				await this.bot.command.handleCommand(interaction as ChatInputCommandInteraction);

			} else if (interaction.isAutocomplete()) {
				await this.bot.command.handleCompletion(interaction as AutocompleteInteraction);

			} else if (interaction.isStringSelectMenu()) {
				await this.bot.command.get<ToneCommand>("tone").handleSelectionInteraction(interaction);
				await handleIntroductionPageSwitch(this.bot, interaction);
				await handleModerationInteraction(this.bot, interaction);

			} else if (interaction.isButton()) {
				await this.bot.conversation.generator.handleButtonInteraction(interaction as ButtonInteraction);
				await handleModerationInteraction(this.bot, interaction);
			}

		} catch (error) {
			await handleError(this.bot, { error: error as Error, reply: false, title: "Failed to process interaction" });
		}
	}
}