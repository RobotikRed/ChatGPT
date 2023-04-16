import { ActionRowBuilder, Awaitable, ButtonBuilder, ButtonInteraction, ButtonStyle, ColorResolvable, CommandInteraction, ComponentBuilder, ComponentEmojiResolvable, EmbedBuilder, EmojiResolvable, Interaction, Message, MessageEditOptions, StringSelectMenuBuilder, StringSelectMenuInteraction, StringSelectMenuOptionBuilder, User } from "discord.js";
import { Bot } from "../bot/bot.js";
import { Response } from "../command/response.js";
import { Utils } from "./utils.js";

interface IntroductionPageBuilderOptions {
    bot: Bot;
    author: User;
}

interface IntroductionPageDesign {
    /* Name of the page */
    title: string;

    /* Emoji for the page */
    emoji: ComponentEmojiResolvable;

    /* Description of the page */
    description: string;

    /* Whether to display the title in the embed */
    displayTitle?: boolean;
}

export interface IntroductionPage {
    /* Explicit index of the page in the selector */
    index: number;

    /* Design for the introduction page */
    design: IntroductionPageDesign;

    /* Callback to execute to build this embed */
    build: (builder: EmbedBuilder, options: IntroductionPageBuilderOptions) => Awaitable<EmbedBuilder>;
}

export const IntroductionPages: IntroductionPage[] = [
    {
        index: 0,
        design: { title: "Introduction", displayTitle: false, description: "Overview of the bot's functionality", emoji: "👋" },

        build: (builder, { author, bot }) => builder
            .setTitle("Hey there 👋")
            .setDescription(`Hey <@${author.id}>, my name is **${bot.client.user!.username}**, and I'm the ultimate AI-powered Discord bot. 🚀\n*Below you can see some of my features, and benefits over other bots you might find on Discord*.`)
            .addFields([
                {
                    name: "Completely free ✨",
                    value: "The bot does not require you to sign up for anything, you can simply start using it - *for completely free*."
                },

                {
                    name: "All AIs in one place 🤖",
                    value: "No more wasting time searching for AI models on various websites; use them all through a single, **ultimate** Discord bot. 🔥"
                },

                {
                    name: "Competitive features 📈",
                    value: "We offer a fair daily limit and amazing message length limit to free users, and an additional **Premium** tier for even more perks; view `/premium info` for more."
                },

                {
                    name: "... and more",
                    value: "Add the bot to your Discord server or try it out here, to see for yourself."
                }
            ])
    },

    {
        index: 1,
        design: { title: "Image generation", emoji: "🖼️", description: "Overview of the image generation features in the bot" },

        build: (builder, { bot }) => builder
            .setDescription(`${bot.client.user!.username} isn't just meant for chatting; you can also generate images using \`/imagine generate\`.`)
            .addFields([
                {
                    name: "Come up with a good prompt 🤔",
                    value: "Think of a good **Stable Diffusion** prompt; or use `/imagine ai` to let ChatGPT do it for you!"
                },

                {
                    name: "Select an awesome model 🖥️",
                    value: "We have an exhaustive list of **Stable Diffusion** models thanks to **[Stable Horde](https://stablehorde.net)**; scroll through them using `/imagine models`."
                },

                {
                    name: "Wait for the results ⏰",
                    value: "In case you change your mind, you can just **cancel** the image generation at any time, by clicking the `Cancel` button."
                }
            ])
    },

    {
        index: 2,
        design: { title: "Various LLMs", emoji: "💬", description: "Information about the growing list of language models the bot supports" },

        build: (builder, { bot }) => builder
            .setDescription(`${bot.client.user!.username} isn't only limited to **ChatGPT**; we also offer various other language models, including **GPT-4**, **Claude** and **Alpaca**.`)
            .addFields([
                {
                    name: "Constantly growing selection 📈",
                    value: "Whenever a new LLM comes out, we'll for sure be the first to add it to our bot."
                },

                {
                    name: "Easy to switch 🔁",
                    value: "Simply switch the current model using `/tone`, and select one of your choice."
                }
            ])
    },

    {
        index: 3,
        design: { title: "Premium tier", emoji: "✨", description: "Perks of being a Premium user" },

        build: (builder, { bot }) => builder
            .setDescription(`All of this wouldn't be possible without our **Premium** supporters. **Premium ✨** gives you additional benefits and incredibly useful features for the bot.`)
            .addFields([
                {
                    name: "Longer messages 🆙",
                    value: `With **Premium**, ${bot.client.user!.username} will be able to generate way longer messages; so that you can generate even more creative stories!`
                },

                {
                    name: "Way lower cool-down ⏰",
                    value: `Chat with **ChatGPT** for as long as you want - without being interrupted by an annoying cool-down! ⏰\nYour cool-down will be lowered to an amazing **10 seconds**, for all normal models.`
                },

                {
                    name: "Image viewing for all models 📸",
                    value: `Something that even **OpenAI** doesn't offer yet; with **Premium** almost all available models will be able to **understand** & **view** images you attach to your messages!`
                }
            ])
    },

    {
        index: 4,
        design: { title: "Usage policies", emoji: "📜", description: "Make sure to follow these rules when using the bot" },

        build: (builder, { bot }) => builder
            .setDescription(`Since ${bot.client.user!.username} is a **public** Discord bot, we set some common etiquette for you to follow when using the bot.\n\nWe have a warning & ban system in place, and may make use of it without any prior warning.\nIt is up to our moderators to decide when an action should be taken.`)
            .addFields([
                {
                    name: "No NSFW content",
                    value: "The chat feature is not meant for NSFW content; trying to bypass the filters or asking the bot for any kind of inappropriate content will result in a a warning or ban.\nAlthough, the \`/imagine generate\` feature *can* be used for NSFW content, if used in a channel marked as NSFW."
                },

                {
                    name: "No racist, sexist, homophobic & discriminatory content",
                    value: `This should be obvious: do not use the bot to spell out any racial slurs, or to generate any inappropriate messages containing racist, sexist, homophobic & discriminatory content.\nSame goes for your messages, racial slurs should be avoided when interacting with a chat bot. If this rule is violated, you may be banned without any further notice.`
                },
                
                {
                    name: "No predatory content",
                    value: "Do not use the bot (both for the chat feature and `/imagine generate`) for any kind of content involving children or underage characters. We will be reporting such messages to Discord, and act with a permanent ban from the bot."
                },

                {
                    name: "Common sense",
                    value: "Before sending a message to the bot that is possibly inappropriate, ask yourself: **would you do this on your own personal account?**"
                },

                {
                    name: "Your privacy",
                    value: "Moderators can only view explictly flagged messages by our automatic filters, otherwise your messages are private and not visible by anyone else. This is done to ensure a safe environment for our users, and to abide by all policies for the APIs we have integrated into the bot."
                }
            ])
    }
]

const buildPageSelector = (bot: Bot, author: User, page: IntroductionPage): StringSelectMenuBuilder => {
    return new StringSelectMenuBuilder()
        .setCustomId(`introduction-page-selector:${author.id}`)
        .setPlaceholder("Select a page...")
        .addOptions(
            IntroductionPages
                .map(page => new StringSelectMenuOptionBuilder()
                    .setLabel(`${page.design.title} [#${page.index + 1}]`)
                    .setDescription(page.design.description)
                    .setEmoji(page.design.emoji)
                    .setValue(`${page.index}`)
                )
        );
}

export const buildIntroductionPage = async (bot: Bot, author: User, page: IntroductionPage = IntroductionPages[0], standalone: boolean = false): Promise<Response> => {
    /* Action component rows to add to the message */
    const rows: ActionRowBuilder<any>[] = [
        new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setURL(Utils.inviteLink(bot))
                    .setLabel("Invite me to your server")
                    .setStyle(ButtonStyle.Link),

                new ButtonBuilder()
                    .setURL(Utils.supportInvite(bot))
                    .setLabel("Join the support server")
                    .setStyle(ButtonStyle.Link),

                new ButtonBuilder()
                    .setEmoji("🗑️")
                    .setStyle(ButtonStyle.Danger)
                    .setCustomId(`delete:${author.id}`)
            )
    ];

    if (!standalone) rows.push(new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(buildPageSelector(bot, author, page))
    );

    /* Build the page embed itself. */
    const embed: EmbedBuilder = await page.build(new EmbedBuilder(), { author, bot });

    /* Set some other values for the embed. */
    if (page.design.displayTitle ?? true) embed.setTitle(`${page.design.title} ${page.design.emoji}`);

    if (!standalone) embed.setFooter({ text: `${page.index + 1} / ${IntroductionPages.length}` });
    embed.setColor(bot.branding.color);

    /* Final response */
    const response: Response = new Response()
        .addEmbed(embed);

    /* Add the selection menu for the pages. */
    rows.forEach(row => response.addComponent(undefined!, row));

    return response;
}

export const introductionPageAt = (index: number | string): IntroductionPage => {
    const page: IntroductionPage | null = IntroductionPages.find(p => p.design.title === index) ?? null;
    if (page !== null) return page;

    /* Actually parse the index into an integer. */
    index = typeof index === "string" ? parseInt(index) : index;
    return IntroductionPages[index];
}

export const handleIntroductionPageSwitch = async (bot: Bot, interaction: StringSelectMenuInteraction): Promise<void> => {
    /* Skip all other selection menu interactions. */
    if (!interaction.customId.startsWith("introduction-page-selector")) return;

    /* ID of the user this menu is intended for */
    const authorID: string = interaction.customId.split(":").pop()!;
    if (interaction.user.id !== authorID) return void await interaction.deferUpdate();

    /* Index of the new page */
    const index: number = parseInt(interaction.values[0]);

    /* The new introduction page itself */
    const page: IntroductionPage = IntroductionPages[index];

    /* Build the introduction page. */
    const response: Response = await buildIntroductionPage(bot, interaction.user, page);

    await Promise.all([
        interaction.deferUpdate(),
        interaction.message.edit(response.get() as MessageEditOptions)
    ]).catch(() => {});
}