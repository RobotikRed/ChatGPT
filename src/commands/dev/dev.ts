import { AttachmentBuilder, Collection, SlashCommandBuilder } from "discord.js";
import { getInfo } from "discord-hybrid-sharding";
import dayjs from "dayjs";

import { DatabaseSubscriptionKey, DatabaseSubscriptionType, DatabaseUser } from "../../db/managers/user.js";
import { SessionCost, SessionCostProducts, SessionSubscription } from "../../conversation/session.js";
import { Command, CommandInteraction, CommandPrivateType, CommandResponse } from "../../command/command.js";
import { Response, ResponseType } from "../../command/response.js";
import { SUBSCRIPTION_DURATION_OPTIONS } from "./grant.js";
import { Bot, BotDiscordClient } from "../../bot/bot.js";

export default class DeveloperCommand extends Command {
	constructor(bot: Bot) {
		const clusters: string[] = [];

		for (let i = 0; i < getInfo().CLUSTER_COUNT; i++) {
			clusters.push(`#${i + 1}`);
		}

		super(bot, new SlashCommandBuilder()
			.setName("dev")
			.setDescription("View developer bot statistics")
			.addSubcommand(builder => builder
				.setName("debug")
				.setDescription("View debug information")
			)
			.addSubcommand(builder => builder
				.setName("flush")
				.setDescription("Execute all the queued database requests in all clusters")
			)
			.addSubcommand(builder => builder
				.setName("restart")
				.setDescription("Restart a specific or this cluster")
				.addStringOption(builder => builder
					.setName("which")
					.setDescription("Which cluster to restart")
					.setRequired(false)
					.setChoices(...clusters.map((cluster, index) => ({
						name: cluster,
						value: index.toString()
					}))))
			)
		, { long: true, private: CommandPrivateType.ModeratorOnly });
	}

    public async run(interaction: CommandInteraction): CommandResponse {
		/* Which sub-command to execute */
		const action: "debug" | "keys" | "restart" | "flush" | "crash" = interaction.options.getSubcommand(true) as any;

		/* View debug information */
		if (action === "debug") {
			const count: number = (await this.bot.client.cluster.broadcastEval(() => this.bot.conversation.session.debug.count))
				.reduce((value, count) => value + count, 0);

			const tokens: number = (await this.bot.client.cluster.broadcastEval(() => this.bot.conversation.session.debug.tokens))
				.reduce((value, count) => value + count, 0);

			const runningRequests: number = (await this.bot.client.cluster.broadcastEval(() => this.bot.conversation.conversations.filter(c => c.locked).size))
				.reduce((value, count) => value + count, 0);

			const uptime: number[] = (await this.bot.client.cluster.fetchClientValues("bot.since")) as number[];
			const guilds: number[] = (await this.bot.client.cluster.fetchClientValues("guilds.cache.size")) as number[];
			const running: boolean[] = (await this.bot.client.cluster.fetchClientValues("bot.started")) as boolean[];

			const fields = [
				{
					key: "Processed messages 💬",
					value: `**\`${count}\`** (\`${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(SessionCostProducts[0].calculate({ completion: tokens, prompt: tokens }).completion)}\`)`
				},

				{
					key: "Running requests 🏓",
					value: `**\`${runningRequests}\`**`
				}
			];

			/* Debug information about the clusters */
			const clusterCount: number = getInfo().CLUSTER_COUNT;
			let clusterDebug: string = "";

			for (let i = 0; i < clusterCount; i++) {
				const clusterUptime: number = uptime[i];
				const clusterGuilds: number = guilds[i];
				const clusterRunning: boolean = running[i];

				if (clusterRunning) clusterDebug = `${clusterDebug}\n\`#${i + 1}\` • **${clusterGuilds}** guilds • **${dayjs.duration(Date.now() - clusterUptime).format("HH:mm:ss")}**`;
			}

			/* Get information about the Stable Horde API user. */
			const user = await this.bot.image.findUser();

			return new Response(ResponseType.Edit)
				.addEmbed(builder => builder
					.setTitle("Development Statistics")
					.setColor("#000000")

					.addFields(fields.map((({ key, value }) => ({
						name: key, value
					}))))
				)
				.addEmbed(builder => builder
					.setColor("#000000")
					.setTitle("Clusters 🤖")
					.setDescription(
						clusterDebug.trim()
					)
				)
				.addEmbed(builder => builder
					.setColor("#000000")
					.setTitle("Stable Horde 🖼️")
					.addFields(
						{ name: "Kudos",            value: `${user.kudos}`, inline: true                 },
						{ name: "Generated images", value: `${user.records.request.image}`, inline: true }
					)
				);

		/* Trigger a specific or this cluster */
		} else if (action === "restart") {
			const which: string = interaction.options.getString("which") ?? getInfo().CLUSTER.toString();
			const index: number = parseInt(which);

			await interaction.editReply(new Response()
				.addEmbed(builder => builder
					.setDescription(`Restarting cluster **#${index + 1}** ...`)
					.setColor("Red")
				)
			.get());

			/* Take the easier route, and exit this cluster directly. */
			if (getInfo().CLUSTER === index) return this.bot.stop(0);

			/* Broadcast a stop to the specific cluster. */
			else await this.bot.client.cluster.broadcastEval(((client: BotDiscordClient) => client.bot.stop(0)) as any, { cluster: index });

		/* Execute all the queued database requests in all clusters */
		} else if (action === "flush") {
			await this.bot.client.cluster.broadcastEval(((client: BotDiscordClient) => client.bot.db.users.workOnQueue()) as any);

			return new Response(ResponseType.Edit)
				.addEmbed(builder => builder
					.setDescription("Done 🙏")
					.setColor("Orange")
				);
		}
    }
}