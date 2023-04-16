import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } from "discord.js";

import { Command, CommandInteraction, CommandResponse } from "../command/command.js";
import { Response, ResponseType } from "../command/response.js";
import { Utils } from "../util/utils.js";
import { Bot } from "../bot/bot.js";

export default class InfoCommand extends Command {
    constructor(bot: Bot) {
        super(bot,
            new SlashCommandBuilder()
                .setName("info")
                .setDescription("View information & statistics about the bot")
		, { long: true, always: true, cooldown: 30 * 1000 });
    }

    public async run(interaction: CommandInteraction): CommandResponse {
        /* Total guild count */
        const guilds: number = ((await this.bot.client.cluster.fetchClientValues("guilds.cache.size")) as number[])
            .reduce((value, count) => value + count, 0);

        /* Total user count */
        const users: number = ((await this.bot.client.cluster.broadcastEval(client => client.guilds.cache.reduce((value, guild) => value + (isNaN(guild.memberCount) ? 0 : guild.memberCount), 0)).catch(() => [])) as number[])
            .reduce((value, count) => value + count, 0);

		/* Total conversation count */
		const conversations: number = ((await this.bot.client.cluster.fetchClientValues("bot.conversation.conversations.size")) as number[])
			.reduce((value, count) => value + count, 0);

		const fields = [
			{
				key: "Servers 🖥️",
				value: guilds
			},

			{
				key: "Latency 🏓",
				value: `**\`${this.bot.client.ws.ping.toFixed(1)}\`** ms`
			},

			{
				key: interaction.guild !== null ? "Cluster & Shard 💎" : "Cluster 💎",
				value: interaction.guild !== null ? `\`${this.bot.data.id + 1}\`/\`${this.bot.client.cluster.count}\` — \`${interaction.guild.shardId}\`` : `\`${this.bot.data.id + 1}\`/\`${this.bot.client.cluster.count}\``
			},

			{
				key: "Users 🫂",
				value: `${users} 💻 — ${(await this.bot.db.client.from(this.bot.db.users.collectionName("users")).select("*", { count: "estimated" })).count ?? 0} 👤`
			},

			{
				key: "Conversations 💬",
				value: conversations
			},

			{
				key: "RAM 🖨️",
				value: `**\`${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}\`** MB`
			}
		];

		const builder: EmbedBuilder = new EmbedBuilder()
			.setTitle("Statistics")
			.setDescription(`The ultimate AI-powered Discord bot 🚀`)
			.setColor("#000000")

			.addFields(fields.map(({ key, value }) => ({
				name: key, value: value.toString(),
				inline: true
			})));

		const row = new ActionRowBuilder<ButtonBuilder>()
			.addComponents(
				new ButtonBuilder()
					.setURL(Utils.inviteLink(this.bot))
					.setLabel("Invite me to your server")
					.setStyle(ButtonStyle.Link),

				new ButtonBuilder()
					.setURL(Utils.supportInvite(this.bot))
					.setLabel("Join the support server")
					.setStyle(ButtonStyle.Link)
			);

        return new Response(ResponseType.Edit)
            .addEmbed(builder)
			.addComponent(ActionRowBuilder<ButtonBuilder>, row);
    }
}