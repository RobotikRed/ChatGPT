import { ActionRowBuilder, Attachment, AttachmentBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChannelType, ComponentEmojiResolvable, ComponentType, DiscordAPIError, DMChannel, EmbedBuilder, EmojiIdentifierResolvable, Guild, InteractionReplyOptions, Message, MessageCreateOptions, MessageEditOptions, PermissionsString, Role, User } from "discord.js";

import { check as moderate, ModerationResult } from "./moderation/moderation.js";
import { ChatNoticeMessage, ResponseMessage } from "../chat/types/message.js";
import { ChatGeneratedInteraction, Conversation } from "./conversation.js";
import { reactToMessage, removeReaction } from "./utils/reaction.js";
import { ChatModel, ModelCapability } from "../chat/types/model.js";
import { buildBanNotice } from "../util/moderation/moderation.js";
import { buildIntroductionPage } from "../util/introduction.js";
import { DatabaseInfo, DatabaseUserInfraction } from "../db/managers/user.js";
import ImagineCommand from "../commands/imagine.js";
import { format } from "../chat/utils/formatter.js";
import { Response } from "../command/response.js";
import { Bot, BotStatus } from "../bot/bot.js";
import ToneCommand from "../commands/tone.js";
import { Utils } from "../util/utils.js";
import { GPTTones } from "./tone.js";

import { GPTGenerationError, GPTGenerationErrorType } from "../error/gpt/generation.js";
import { handleError } from "../util/moderation/error.js";
import { GPTAPIError } from "../error/gpt/api.js";
import { sendTermsNotice } from "../util/terms.js";
import { OtherPrompts } from "../chat/client.js";

/* Emoji to indicate that a generation is running */
const BOT_GENERATING_EMOJI: EmojiIdentifierResolvable = "<a:loading:1051419341914132554>";

/* Permissions required by the bot to function correctly */
const BOT_REQUIRED_PERMISSIONS: { [key: string]: PermissionsString } = {
	"Add Reactions": "AddReactions",
	"Use External Emojis": "UseExternalEmojis",
	"Read Message History": "ReadMessageHistory"
}

enum GeneratorButtonType {
	Continue
}

export interface GeneratorOptions {
	/* Discord message, which triggered the generation */
	message: Message;

	/* Content of the message */
	content: string;

	/* Author of the message */
	author: User;

	/* Whether the user used the Continue button */
	button?: GeneratorButtonType;
}

export class Generator {
    /* Base class for everything */
    private bot: Bot;

    constructor(bot: Bot) {
        this.bot = bot;
    }

	/**
	 * Process a partial or completed message into a readable & formatted Discord embed.
	 * @param data Response data
	 * 
	 * @returns Formatted Discord message
	 */
	public async process(conversation: Conversation, guild: Guild | null, data: ResponseMessage, options: GeneratorOptions, db: DatabaseInfo, moderations: (ModerationResult | null)[], pending: boolean): Promise<Response | null> {
		/* If the message wasn't initialized yet, ignore this. */
		if (data === null) return null;

		/* Embeds to display in the message */
		const embeds: EmbedBuilder[] = [];
		const response: Response = new Response();

		/* Formatted generated response */
		let content: string = format(data.text).trim();

		/* If the received data includes generated images, display them. */
		if (data.images.length > 0) {
			for (const [ index, image ] of data.images.entries()) {
				response.addAttachment(new AttachmentBuilder(image.data.buffer)
					.setName(`image-${index}.png`)
				);

				const builder = new EmbedBuilder()
					.setImage(`attachment://image-${index}.png`)
					.setColor("Purple");

				if (image.prompt) builder.setTitle(Utils.truncate(image.prompt, 100));
				if (image.duration) builder.setFooter({ text: `${(image.duration / 1000).toFixed(1)}s${image.notice ? ` • ${image.notice}` : ""}` });

				embeds.push(builder);
			}
		}

		/* If the received message type is a notice message, display it accordingly. */
		if (data.type === "Notice") {
			response
				.setContent(null)
				.addEmbed(builder => builder
					.setDescription(`${data.text} ${pending ? `**...** ${BOT_GENERATING_EMOJI}` : ""}`)
					.setColor("Orange")
				);

			embeds.forEach(embed => response.addEmbed(embed));
			return response;
		}

		/* If the received data is a chat notice request, simply add the notice to the formatted message. */
		if (data.type === "ChatNotice") {
			embeds.push(new EmbedBuilder()
				.setDescription(`${(data as ChatNoticeMessage).notice} ${pending ? `**...** ${BOT_GENERATING_EMOJI}` : ""}`)
				.setColor("Orange")
			);

			pending = false;
		}

		for (const moderation of moderations) {
			/* Add a moderation notice, if applicable. */
			if (moderation !== null && (moderation.flagged || moderation.blocked)) embeds.push(new EmbedBuilder()
				.setDescription(
					!moderation.blocked
						? `${moderation.source === "user" ? "Your message" : `**${this.bot.client.user!.username}**'s response`} may violate our **usage policies**. *If you use the bot as intended, you can ignore this notice.*`
						: `${moderation.source === "user" ? "Your message" : `**${this.bot.client.user!.username}**'s response`} violates our **usage policies**. *If you continue to abuse the bot, we may have to take moderative actions*.`
				)
				.setColor(moderation.blocked ? "Red" : "Orange")
			);
		}

		/* Only show the daily limit, if the generation request is already finished. */
		if (!pending) {
			const buttons: ButtonBuilder[] = [];

			/* If the message got cut off, add a Continue button. */
			if (data.raw && data.raw.finishReason === "maxLength") buttons.push(
				new ButtonBuilder()
					.setCustomId(`continue:${conversation.id}`)
					.setStyle(ButtonStyle.Secondary)
					.setLabel("Continue")
					.setEmoji("📜")
			);

			buttons.push(
				new ButtonBuilder()
					.setCustomId(`tone:${conversation.id}`)
					.setEmoji(conversation.tone.emoji.display as ComponentEmojiResolvable ?? conversation.tone.emoji.fallback)
					.setLabel(conversation.tone.name)
					.setStyle(ButtonStyle.Secondary),

				new ButtonBuilder()
					.setCustomId(`user:${conversation.id}`)
					.setDisabled(true)
					.setEmoji(this.bot.db.users.subscriptionIcon(db))
					.setLabel(conversation.user.tag)
					.setStyle(ButtonStyle.Secondary)
			);

			const row = new ActionRowBuilder<ButtonBuilder>()
				.addComponents(buttons);

			response.addComponent(ActionRowBuilder<ButtonBuilder>, row);
		}

		/* If the generated message finished due to reaching the token limit, show a notice. */
		if (!pending && data.raw && data.raw.finishReason === "maxLength") {
			embeds.push(new EmbedBuilder()
				.setDescription(`This message reached the length limit, and was not fully generated.${!this.bot.db.users.canUsePremiumFeatures(db) ? "\n✨ _**Premium** removes the length limit **entirely**, and grants you exclusive features - view \`/premium info\` for more_." : ""}`)
				.setColor("Yellow")
			);

			content = `${content} **...**`;
		}

		/* If the previous message got cut off, add an indicator. */
		if (options.button === GeneratorButtonType.Continue) {
			content = `**...** ${content}`;
		}

		/* Generated response, with the pending indicator */
		const formatted: string = `${content} **...** ${BOT_GENERATING_EMOJI}`;

		/* If the message would be too long, send it as an attachment. */
		if (formatted.length > 2000) {
			response.addAttachment(new AttachmentBuilder(Buffer.from(content))
				.setName("output.txt")
			);

			response.setContent(pending ? BOT_GENERATING_EMOJI.toString() : "_ _");
		} else {
			/* Finally, set the actual content of the message. */
			response.setContent(pending ? formatted : content);
		}
		
		embeds.forEach(embed => response.addEmbed(embed));
		return response;
	}

	/**
	 * Handle interactions with the suggested response buttons on messages.
	 * @param button Button interaction to handle
	 */
	public async handleButtonInteraction(button: ButtonInteraction): Promise<void> {
		if (button.message.author.id !== this.bot.client.user!.id) return;

		if (button.customId === "acknowledge-warning" || button.customId === "ignore" || button.customId === "send" || button.customId.startsWith("introduction-page-selector")) return;
		if (button.channelId === this.bot.app.config.channels.error.channel || button.channelId === this.bot.app.config.channels.moderation.channel) return;

		const parts: string[] = button.customId.split(":");
		if (parts.length === 1) return;

		/* Get the user identifier and action this button is meant for. */
		const action: string = parts[0];
		const id: string = parts[1];

		if (id !== "-1" && id !== button.user.id && !action.startsWith("i-view")) return void await button.deferUpdate();

		/* Get the user's conversation. */
		const conversation: Conversation = await this.bot.conversation.create(button.user);

		/* If the conversation wasn't loaded yet, but it is cached in the database, try to load it. */
		if (!conversation.active && await conversation.cached()) {
			await conversation.loadFromDatabase();
			await conversation.init();
		}

		/* If the user requested the tone selector, ... */
		if (action === "tone") {
			/* Generate the selector message. */
			const response: Response = this.bot.command.get<ToneCommand>("tone").format(conversation);
			response.setEphemeral(true);

			return void await button.reply(response.get() as InteractionReplyOptions);

		/* If the user interacted generated image, ... */
		} else if (action.startsWith("i-")) {
			return await (this.bot.command.get<ImagineCommand>("imagine")).handleButtonInteraction(button, conversation, action.replace("i-", ""), parts);

		/* If the user requsted to delete this interaction response, ... */
		} else if (action === "delete") {
			return void await button.message.delete().catch(() => {});
		}

		/* Remaining cool-down time */
		const remaining: number = (conversation.cooldown.state.startedAt! + conversation.cooldown.state.expiresIn!) - Date.now();

		/* If the command is on cool-down, don't run the request. */
		if (conversation.cooldown.active && remaining > Math.max(conversation.cooldown.state.expiresIn! / 2, 10 * 1000)) {
			const subscriptionType = this.bot.db.users.subscriptionType(await this.bot.db.users.fetchData(button.user, button.guild));

			const additional: EmbedBuilder | null = subscriptionType !== "UserPremium" ?
					subscriptionType === "Free" ?
						new EmbedBuilder()
							.setDescription(`✨ By buying **[Premium](${Utils.shopURL()})**, your cool-down will be lowered to **a few seconds** only, with **unlimited** messages per day.\n**Premium** *also includes further benefits, view \`/premium info\` for more*. ✨`)
							.setColor("Orange")
					
					: subscriptionType === "GuildPremium"
						? 
							new EmbedBuilder()
							.setDescription(`✨ By buying **[Premium](${Utils.shopURL()})** for yourself, the cool-down will be lowered to only **a few seconds**, with **unlimited** messages per day.\n**Premium** *also includes further benefits, view \`/premium info\` for more*. ✨`)
							.setColor("Orange")
						: null
				: null;

			const reply = await button.reply({
				embeds: [
					new EmbedBuilder()
						.setTitle("Whoa-whoa... slow down ⌛")
						.setDescription(`I'm sorry, but I can't keep up with your requests. You can talk to me again <t:${Math.floor((conversation.cooldown.state.startedAt! + conversation.cooldown.state.expiresIn! + 1000) / 1000)}:R>. 😔`)
						.setColor("Yellow"),

					...additional !== null ? [ additional ] : []
				],

				ephemeral: true
			}).catch(() => null);

			if (reply === null) return;

			/* Once the cool-down is over, delete the invocation and reply message. */
			setTimeout(async () => {
				await button.deleteReply().catch(() => {});
			}, remaining);
		}

		/* Continue generating the cut-off message. */
		if (action === "continue") {
			await button.deferUpdate();

			await this.handle({
				button: GeneratorButtonType.Continue,
				content: OtherPrompts.Continue,
				message: button.message,
				author: button.user
			});
		}
	}

	private mentions(message: Message): "interactionReply" | "reply" | "inMessage" | "user" | "role" | "dm" | null {
		if (message.mentions.everyone) return null;
		if (message.channel.type === ChannelType.DM) return "dm";

		if (message.reference && message.reference.messageId && message.channel.messages.cache.get(message.reference.messageId) && message.channel.messages.cache.get(message.reference.messageId)!.interaction) return "interactionReply";
		if (message.mentions.repliedUser !== null && message.mentions.repliedUser.id === this.bot.client.user!.id && message.mentions.users.get(this.bot.client.user!.id)) return "reply";

		if (message.content.startsWith(`<@${this.bot.client.user!.id}>`) || message.content.startsWith(`<@!${this.bot.client.user!.id}>`) || message.content.endsWith(`<@${this.bot.client.user!.id}>`) || message.content.endsWith(`<@!${this.bot.client.user!.id}>`)) return "user";
		else if (message.content.includes(`<@${this.bot.client.user!.id}>`)) return "inMessage";
		
		const roles: Role[] = Array.from(message.mentions.roles.values());
		const mentionedRole: boolean = roles.find(r => !r.editable && ([ "ChatGPT", "Turing" ].includes(r.name))) != undefined;

		if (mentionedRole) return "role";
		return null;
	}

    /**
     * Process the specified Discord message, and if it is valid, send a request to
     * the chat handler to generate a response for the message content.
     * 
     * @param message Message to process
     * @param existing Message to edit, instead of sending a new reply
     */
    public async handle(options: GeneratorOptions): Promise<void> {
		const messageContent: string = options.content;
		const { message, author } = options;

		/* Check whether the bot was mentioned in the message, directly or indirectly. */
		const mentions = this.mentions(message);

		/* If the message was sent by a bot, or the bot wasn't mentioned in the message, return. */
		if (options.button == undefined && (author.bot || mentions === null)) return;

		/* If the message was sent in the error or moderation channel, ignore it entirely. */
		if (message.channelId === this.bot.app.config.channels.error.channel || message.channelId === this.bot.app.config.channels.moderation.channel) return;

		/* If the message is a reply to an interaction, ignore it. */
		if (mentions === "interactionReply") return;
		const guild: Guild | null = message.guild;

		if (!this.bot.started) return void await new Response()
			.addEmbed(builder => builder
				.setDescription("The bot is currently reloading ... ⌛")
				.setFooter({ text: "This shouldn't take longer than a few minutes; check back again." })
				.setColor("Orange")
			).send(options.message);

		/* Current status of the bot */
		const status: BotStatus = await this.bot.status();

		if (status.type === "maintenance") return void await new Response()
			.addEmbed(builder => builder
				.setTitle("The bot is currently under maintenance 🛠️")
				.setDescription(status.notice !== undefined ? `*${status.notice}*` : null)
				.setTimestamp(status.since)
				.setColor("Orange")
			).send(options.message);

		/* Clean up the message's content. */
		let content: string = Utils.cleanContent(this.bot, messageContent);

		/* Text attachments for the message */
		const textAttachments: Attachment[] = Array.from(message.attachments.values())
			.filter(attachment =>
				attachment.name
				&& (attachment.name.endsWith(".txt") || attachment.name.endsWith(".rtf") || attachment.name.endsWith(".c") || attachment.name.endsWith(".js") || attachment.name.endsWith(".py"))
			);

		/* If the user attached a text file, read it and concatenate it to the original prompt. */
		if (textAttachments.length > 0) {
			/* Get the first available text attachment to fetch. */
			const first: Attachment = textAttachments[0];

			try {
				/* Try to fetch the text attachment. */
				const response = await fetch(first.url);
				if (response.status !== 200) throw new Error("Failed");

				/* Response data */
				const data: string = await response.text();

				if (content.length > 0) content = `${content}\n\nI have attached a file to my message. Content of the attached file called '${first.name}':\n"""\n${data}\n"""`;
				else content = data;

			/* Stub */
			} catch (_) {}
		}

		/* If the user mentioned the role instead of the user, and the message doesn't have any content,
		   show the user a small notice message telling them to ping the bot instead. */
		if (mentions === "role" && content.length === 0) {
			return void await new Response()
				.addEmbed(builder => builder
					.setTitle("Hey there... 👋")
					.setColor("Yellow")
					.setDescription("To chat with me, you need to ping the **user** instead of the role. *Then, I'll be able to chat with you normally*.")
				)
			.send(options.message).catch(() => {});
		}

		/* If the user mentioned the bot somewhere in the message (and not at the beginning), react with a nice emoji. */
		if (mentions === "inMessage") return void await reactToMessage(this.bot, message, "👋");

		/* If the user sen't an empty message, respond with the introduction message. */
		if (content.length === 0) {
			const page: Response = await buildIntroductionPage(this.bot, author);
			return void await page.send(options.message).catch(() => {});
		}

		/* Get the user & guild data from the database, if available. */
		let db = await this.bot.db.users.fetchData(author, guild);

		/* If the user hasn't accepted the Terms of Service yet, ... */
		await sendTermsNotice(this.bot, db.user, message);

		const banned: DatabaseUserInfraction | null = this.bot.db.users.banned(db.user);
		const unread: DatabaseUserInfraction[] = this.bot.db.users.unread(db.user);

		/* If the user is banned from the bot, send a notice message. */
		if (banned !== null) return void buildBanNotice(this.bot, db.user, banned).send(message);

		if (unread.length > 0) {
			const row = new ActionRowBuilder<ButtonBuilder>()
				.addComponents(
					new ButtonBuilder()
						.setCustomId("acknowledge-warning")
						.setLabel("Acknowledge")
						.setStyle(ButtonStyle.Danger)
				);

			const reply: Message = await new Response()
				.addComponent(ActionRowBuilder<ButtonBuilder>, row)
				.addEmbed(builder => builder
					.setTitle(`Before you continue ...`)
					.setDescription(`You received **${unread.length > 1 ? "several warnings" : "a warning"}**, as a consequence of your messages with the bot.`)
					
					.addFields(unread.map(i => ({
						name: `${i.reason} ⚠️`,
						value: `*<t:${Math.floor(i.when / 1000)}:F>*`
					})))

					.setFooter({ text: "This is only a warning; you can continue to use the bot. If you however keep breaking the rules, we may have to take further administrative actions." })
					.setColor("Red")
				).send(message) as Message;

			/* Wait for the `Acknowledge` button to be pressed, or for the collector to expire. */
			const collector = reply.createMessageComponentCollector<ComponentType.Button>({
				componentType: ComponentType.Button,
				filter: i => i.user.id === author.id && i.customId === "acknowledge-warning",
				time: 60 * 1000,
				max: 1
			});

			/* When the collector is done, delete the reply message & continue the execution. */
			await new Promise<void>(resolve => collector.on("end", async () => {
				await reply.delete().catch(() => {});
				resolve();
			}));

			/* Mark the unread messages as read. */
			await this.bot.db.users.read(db.user, unread);
			db.user = await this.bot.db.users.fetchUser(author);
		}

		/* Whether the user can access Premium features */
		const premium: boolean = this.bot.db.users.canUsePremiumFeatures(db);

		/* Conversation of the author */
		let conversation: Conversation = null!;

		try {
			/* Get the author's active conversation. */
			conversation = this.bot.conversation.get(author)!;

			/* If the conversation is still `null`, try to create a conversation from the database for this user. */
			if (conversation === null) {
				conversation = await this.bot.conversation.create(author);

				/* Then, try to use the data stored in the database to create a conversation. */
				try {
					await conversation.loadFromDatabase();
				} catch (_) {}
			}
		
			/* If the conversation's session is locked at this point - meaning that is either initializing or refreshing - notify the user. */
			if (conversation.session.locked) return void await new Response()
				.addEmbed(builder => builder
					.setDescription("Your assigned session is currently starting up ⏳")
					.setColor("Yellow")
			).send(message).catch(() => {});

			/* If the session hasn't been initialized yet, set it up on-demand. */
			if (!conversation.session.active) {
				await conversation.session.init()
					.catch(async (error: Error) => {
						throw error;
					});
			}

			/* Initialize the user's conversation, if not done already. */
			if (!conversation.active) await conversation.init();

		} catch (error) {
			if (error instanceof Error && error.message == "Session is busy") return void await new Response()
				.addEmbed(builder => builder
					.setDescription("Your assigned session is currently starting up ⏳")
					.setColor("Yellow")
			).send(message);

			if (error instanceof GPTGenerationError && error.options.data.type === GPTGenerationErrorType.NoFreeSessions) return void await new Response()
				.addEmbed(builder => builder
					.setTitle("Uh-oh... 😬")
					.setDescription("We are currently dealing with *a lot* of traffic & are **not** able to process your message at this time.")
					.setFooter({ text: "Please try again later." })
					.setColor("Red")
				).send(message);

			await handleError(this.bot, {
				message,
				reply: false,
				error: error as Error
			});

			return void await new Response()
				.addEmbed(builder => builder
					.setTitle("Uh-oh... 😬")
					.setDescription("It seems like we experienced an issue while trying to resume your conversation.\n*The developers have been notified*.")
					.setColor("Red")
				).send(message).catch(() => {});
		}

		/* If the conversation is still locked, send a notice message & delete it once the request completed. */
		if (conversation.locked) return void await new Response()
			.addEmbed(builder => builder
				.setDescription("You already have a request running in this conversation, *wait for it to finish* 😔")
				.setColor("Red")
			).send(message).catch(() => {});

		/* Remaining cool-down time */
		const remaining: number = (conversation.cooldown.state.startedAt! + conversation.cooldown.state.expiresIn!) - Date.now();

		/* If the command is on cool-down, don't run the request. */
		if (conversation.cooldown.active && remaining > Math.max(conversation.cooldown.state.expiresIn! / 2, 10 * 1000)) {
			const subscriptionType = this.bot.db.users.subscriptionType(db);

			const additional: EmbedBuilder | null = subscriptionType !== "UserPremium" ?
					subscriptionType === "Free" ?
						new EmbedBuilder()
							.setDescription(`✨ By buying **[Premium](${Utils.shopURL()})**, your cool-down will be lowered to **a few seconds** only, with **unlimited** messages per day.\n**Premium** *also includes further benefits, view \`/premium info\` for more*. ✨`)
							.setColor("Orange")
					
					: subscriptionType === "GuildPremium"
						? 
							new EmbedBuilder()
							.setDescription(`✨ By buying **[Premium](${Utils.shopURL()})** for yourself, the cool-down will be lowered to only **a few seconds**, with **unlimited** messages per day.\n**Premium** *also includes further benefits, view \`/premium info\` for more*. ✨`)
							.setColor("Orange")
						: null
				: null;

			const reply = await message.reply({
				embeds: [
					new EmbedBuilder()
						.setTitle("Whoa-whoa... slow down ⌛")
						.setDescription(`I'm sorry, but I can't keep up with your requests. You can talk to me again <t:${Math.floor((conversation.cooldown.state.startedAt! + conversation.cooldown.state.expiresIn! + 1000) / 1000)}:R>. 😔`)
						.setColor("Yellow"),

					...additional !== null ? [ additional ] : []
				]
			}).catch(() => null);

			if (reply === null) return;

			/* Once the cool-down is over, delete the invocation and reply message. */
			setTimeout(async () => {
				await reply.delete().catch(() => {});
			}, remaining);

			await reactToMessage(this.bot, message, "🐢");
			return;

		/* If the remaining time is negligible, wait for the cool-down to expire. */
		} else if (conversation.cooldown.active) {
			conversation.locked = true;

			await reactToMessage(this.bot, message, "⌛");
			await new Promise<void>(resolve => setTimeout(resolve, remaining));
			await removeReaction(this.bot, message, "⌛");

			conversation.locked = false;
		}

		/* If the user is trying to use a Premium-only tone, while not having access to one anymore, simply set it back to the default. */
		if (conversation.tone.settings.premium && !this.bot.db.users.canUsePremiumFeatures(db)) await conversation.changeTone(GPTTones[0]);

		/* Model to use for chat generation, as specified by the user's configured tone */
		const model: ChatModel = conversation.session.client.modelForTone(conversation.tone);

		/* Whether the user attached any images to their message */
		const attachedImages: boolean = conversation.session.client.getMessageAttachments(message).length > 0;

		/* If the user attached images to their messages, but doesn't have Premium access, ignore their request. */
		if (attachedImages && !premium) return void await new Response()
			.addEmbed(builder => builder
				.setDescription("✨ **ChatGPT** will be able to view your images with **Premium**. 🖼️\n**Premium** *also includes further benefits, view \`/premium info\` for more*. ✨")
				.setColor("Orange")
			).send(message);

		/* If the user attached images to their message, and is currently on a model that doesn't support image attachments, show them a notice. */
		if (!model.hasCapability(ModelCapability.ImageViewing) && attachedImages) return void await new Response()
			.addEmbed(builder => builder
				.setDescription(`The selected tone **${conversation.tone.name}** ${conversation.tone.emoji.display ?? conversation.tone.emoji.fallback} doesn't support images 😔`)
				.setColor("Red")
			).send(message);

		/* Run the bot detection. */
		/*const botResults: BotDetectionResult | null = await executeBotDetection(this.bot, { user: author, db });

		if (botResults === null || botResults.blocked) return void await new Response()
			.addEmbed(builder => builder
				.setTitle("Uh-oh... 🤖")
				.setDescription("Our automated filters have flagged your account as possibly suspicious or automated, *try your request again later*. 😔")
				.setFooter({ text: "We automatically block new Discord accounts from using the bot, to prevent abuse." })
				.setColor("Red")
			).send(message).catch(() => {});*/

		conversation.locked = true;

		/* If the message content was not provided by another source, check it for profanity & ask the user if they want to execute the request anyways. */
		const moderation: ModerationResult | null = content.length > 0 && !options.button ? await moderate({
			conversation, db, content, message,
			source: "user"
		}) : null;

		conversation.locked = false;

		/* If the message was flagged, stop this request. */
		if (moderation !== null && moderation.blocked) return;

		/* Reply message placeholder */
		let reply: Message = null!;

		/* Response data */
		let final: ChatGeneratedInteraction = null!;
		let data: ResponseMessage | null = null!;
		let queued: boolean = false;

		/* Whether partial results should be shown, and often they should be updated */
		const partial: boolean = true;
		const updateTime: number = this.bot.db.users.canUsePremiumFeatures(db) ? 2700 : 5200;

		let typingTimer: NodeJS.Timer | null = setInterval(async () => {
			try {
				await message.channel.sendTyping();
			} catch (_) {}
		}, 7500);

		const updateTimer = setInterval(async () => {
			/* If no data has been generated yet, skip it this time. */
			if (data === null || (!partial && (data.type === "Chat" || data.type === "ChatNotice"))) return;

			/* Generate a nicely formatted embed. */
			const response: Response | null = await this.process(conversation, guild, data, options, db, [ moderation ], true);

			/* Send an initial reply placeholder. */
			if (reply === null && final === null && !queued && (partial || (!partial && (data.type !== "Chat" && data.type !== "ChatNotice")))) {
				queued = true;

				if (response === null) {
					queued = false;
					return;
				}

				if (typingTimer !== null) {
					clearInterval(typingTimer);
					typingTimer = null;
				}

				try {
					reply = await message.reply(response.get() as MessageCreateOptions).catch(() => null!);
					queued = false;
				} catch (_) {
					reply = await message.channel.send(response.get() as MessageCreateOptions).catch(() => null!)
					queued = false;
				}

			} else if (reply !== null && !queued && (partial || (!partial && (data.type !== "Chat" && data.type !== "ChatNotice")))) {	
				try {
					/* Edit the sent message. */
					if (reply !== null && response !== null) await reply.edit(response.get() as MessageEditOptions);

				} catch (error) {
					reply = null!;
					queued = false;
				}
			}
		}, updateTime);

		const onProgress = async (raw: ResponseMessage): Promise<void> => {
			/* Update the current response data. */
			data = raw;
		};

		/* If the user used the `Continue` button, remove it from the original message. */
		if (conversation.previous !== null && conversation.previous.reply !== null) {
			/* Remove all components from the message. */
			await conversation.previous.reply.edit({
				components: []
			}).catch(() => {});
		}

		/**
		 * Update the existing reply or send a new reply, to show the error message.
		 * @param response Response to send
		 */
		const sendError = async (response: Response, notice: boolean = true): Promise<void> => {
			/* Wait for the queued message to be sent. */
			while (queued) {
				await new Promise(resolve => setTimeout(resolve, 500));
			}

			try {
				clearInterval(updateTimer);
				if (notice) response.embeds[0].setDescription(`${response.embeds[0].data.description}\n_If you continue to experience issues, join our **[support server](${Utils.supportInvite(this.bot)})**_.`);

				if (reply === null) await response.send(message);
				else await reply.edit(response.get() as MessageEditOptions);

			} catch (_) {}
		}

		/* Start the generation process. */
		try {
			if (mentions !== "dm") reactToMessage(this.bot, message, "orb:1088545392351793232");
			await message.channel.sendTyping();

			/* Send the request to ChatGPT. */
			final = await conversation.generate({
				...options,
				conversation, db,

				prompt: content,
				trigger: message,
				onProgress: onProgress,
				moderation: moderation
			});

		} catch (err) {
			/* Figure out the generation error, that actually occurred */
			const error: GPTGenerationError | GPTAPIError | Error = err as Error;
			if (err instanceof DiscordAPIError) return;

			if (error instanceof GPTGenerationError && error.options.data.type === GPTGenerationErrorType.NoFreeSessions) return await sendError(new Response()
				.addEmbed(builder => builder
					.setTitle("Uh-oh... 😬")
					.setDescription("We are currently dealing with *a lot* of traffic & are **not** able to process your message at this time 😔")
					.setFooter({ text: "Please try again later." })
					.setColor("Red")
				), false);

			if (error instanceof GPTGenerationError && error.options.data.type === GPTGenerationErrorType.Empty) return await sendError(new Response()
				.addEmbed(builder => builder
					.setDescription(`**${this.bot.client.user!.username}**'s response was empty for this prompt, *try again* 😔`)
					.setColor("Red")
				), false);

			if (error instanceof GPTGenerationError && error.options.data.type === GPTGenerationErrorType.Length) return await sendError(new Response()
				.addEmbed(builder => builder
					.setDescription(`Your message is too long for **${conversation.tone.name}**. ${conversation.tone.emoji.display ?? conversation.tone.emoji.fallback}\n\n*Try resetting your conversation, and sending shorter messages to the bot, in order to avoid reaching the limit*.`)
					.setColor("Red")
				), false);

				if (error instanceof GPTGenerationError && error.options.data.type === GPTGenerationErrorType.Busy) return await sendError(new Response()
				.addEmbed(builder => builder
					.setDescription("You already have a request running in this conversation, *wait for it to finish* 😔")
					.setColor("Red")
				), false);

			if (error instanceof GPTAPIError && error.isServerSide()) {
				await handleError(this.bot, {
					message,
					error,
					reply: false,
					title: "Server-side error"
				});

				return await sendError(new Response()
					.addEmbed(builder => builder
						.setTitle("Uh-oh... 😬")
						.setDescription(`**${model.settings.name}** ${conversation.tone.emoji.display ?? conversation.tone.emoji.fallback} is currently experiencing *server-side* issues.`)
						.setColor("Red")
					)
				);
			}

			/* Try to handle the error & log the error message. */
			await handleError(this.bot, {
				message,
				error,
				reply: false
			});

			return await sendError(new Response()
				.addEmbed(builder => builder
					.setTitle("Uh-oh... 😬")
					.setDescription("It seems like we had trouble generating a response for your message.")
					.setColor("Red")
				));

		} finally {
			/* Clean up the timers. */
			if (typingTimer !== null) clearInterval(typingTimer);
			clearInterval(updateTimer);

			if (mentions !== "dm") await removeReaction(this.bot, message, "orb:1088545392351793232");
		}

		/* Try to send the response & generate a nice embed for the message. */
		try {
			/* If everything went well, increase the usage for the user too. */
			await this.bot.db.users.incrementInteractions(db.user);

			/* If the output is empty for some reason, set a placeholder message. */
			if (final.output.text.length === 0) {
				(final.output as ChatNoticeMessage).text = `**${this.bot.client.user!.username}**'s response was empty for this prompt, *please try again* 😔`;
				final.output.type = "Notice";
			}

			/* Gemerate a nicely formatted embed. */
			const response: Response | null = final !== null ? await this.process(conversation, guild, final.output, options, db, [ moderation, final.moderation ], false) : null;

			/* If the embed failed to generate, send an error message. */
			if (response === null) return await sendError(new Response()
				.addEmbed(builder => builder
					.setTitle("Uh-oh... 😬")
					.setDescription(`It seems like **${this.bot.client.user!.username}** had trouble generating the formatted message for your request.`)
					.setColor("Red")
				));

			/* Final reply message to the invocation message */
			let replyMessage: Message | null = null;

			/* Wait for the queued message to be sent. */
			while (queued) {
				await new Promise(resolve => setTimeout(resolve, 500));
			}

			/* Edit & send the final message. */
			try {
				if (reply !== null) {
					try {
						replyMessage = await reply.edit(response.get() as MessageEditOptions);
					} catch (_) {
						replyMessage = await message.reply(response.get() as MessageCreateOptions);
					}
				} else {
					replyMessage = await message.reply(response.get() as MessageCreateOptions);
				}
			} catch (_) {
				/* Add an "author" embed to the message, in order to indicate who actually triggered this message. */
				const res = response
					.addEmbed(builder => builder
						.setAuthor({ name: author.tag, iconURL: author.displayAvatarURL() })
						.setDescription(content)
						.setColor("Red")
					);

				replyMessage = await message.channel.send(res.get() as MessageCreateOptions);
			}

			/* Update the reply message in the history entry, if the conversation wasn't reset. */
			if (conversation.history.length > 0) conversation.history[conversation.history.length - 1].reply = replyMessage;		

		} catch (error) {
			/* Don't try to handle Discord API errors, just send the user a notice message in DMs. */
			if (error instanceof DiscordAPIError) {
				try {
					/* Create the DM channel, if it doesn't already exist. */
					const channel: DMChannel = await this.bot.client.users.createDM(author.id);
			
					await new Response()
						.addEmbed(builder => builder
							.setTitle("Uh-oh... 😬")
							.setDescription(`It seems like the permissions in <#${message.channel.id}> aren't set up correctly for me. Please contact a server administrator and tell them to check all of these permissions:\n\n${Object.keys(BOT_REQUIRED_PERMISSIONS).map(key => `• \`${key}\``).join("\n")}\n\n_If you're repeatedly having issues, join our **[support server](${Utils.supportInvite(this.bot)})**_.`)
							.setColor("Red")
						)
					.send(channel);
				} catch (error) {}
			}

			await handleError(this.bot, {
				error: error as Error,
				reply: false,
				message				
			});
		}
    }
}