import { CommandInteraction, InteractionResponse, Message, User } from "discord.js"

import { Response } from "../command/response.js"
import { Bot } from "../bot/bot.js";
import { DatabaseUser } from "../db/managers/user.js";

/* How long to display the terms notice for */
const TERMS_TIMEOUT_DURATION: number = 10 * 1000;

const formatTermsResponse = (bot: Bot): Response => {
    return new Response()
        .addEmbed(builder => builder
            .setTitle("Terms of Service")
            .setDescription(`By using our service, you agree to the **[Terms of Service](https://turingai.tech/botterms)**.`)
            .setFooter({ text: `This message will be deleted in ${TERMS_TIMEOUT_DURATION / 1000} seconds.` })
            .setColor(bot.branding.color)
        );
}

/**
 * Show an embed about the Terms of Service of the bot to the user.
 * 
 * @param bot Bot instance
 * @param db Database user instance
 * @param message Message/interaction to reply to
 */
export const sendTermsNotice = async (bot: Bot, db: DatabaseUser, message: CommandInteraction | Message): Promise<void> => {
    /* If the user already accepted the Terms of Service, ignore this. */
    if (db.acceptedTerms) return;

    const response: Response = formatTermsResponse(bot);

    /* Reply to the interaction / invocation message with the terms notice. */
    const reply: InteractionResponse | Message | null = await response.send(message);
    if (reply === null) return;

    await new Promise<void>(async resolve => {
        setTimeout(async () => {
            try {
                /* Delete the original reply, if it's a message. */
                if (message instanceof Message) await reply.delete();

                /* Otherwise, just continue normally. */
                else return;
            } catch (_) {
                /* Stub... */
            } finally {
                resolve();
            }
        }, TERMS_TIMEOUT_DURATION);
    });

    await bot.db.users.addUserToQueue(db, {
        acceptedTerms: true
    });
}