import { ActivityType } from "discord.js";
import chalk from "chalk";

import { chooseStatusMessage } from "../util/status.js";
import { Event } from "../event/event.js";
import { Bot } from "../bot/bot.js";

export default class ReadyEvent extends Event {
	constructor(bot: Bot) {
		super(bot, "ready");
	}

	public async run(): Promise<void> {
		this.bot.logger.info(`Started on ${chalk.bold(this.bot.client.user!.tag)}.`);

		if (!this.bot.started) {
			/* While the bot is still starting, set a placeholder activity. */
			/*this.bot.client.user!.setActivity({
				type: ActivityType.Playing,
				name: `Reloading ...`
			});

			this.bot.client.user!.setPresence({
				status: "dnd"
			});*/
			
			this.bot.once("done", () => {
				setInterval(() => chooseStatusMessage(this.bot), 5 * 60 * 1000);
				chooseStatusMessage(this.bot);
			});

		} else {
			setInterval(() => chooseStatusMessage(this.bot), 5 * 60 * 1000);
			chooseStatusMessage(this.bot);
		}

		/* Mark this cluster as ready. */
		this.bot.client.cluster.triggerReady();
	}
}