import { Message } from "discord.js";

import { ChatNoticeMessage, PartialResponseMessage, ResponseMessage } from "./message.js";
import { Conversation } from "../../conversation/conversation.js";
import { ChatBaseImage, ChatInputImage } from "./image.js";
import { DatabaseInfo } from "../../db/managers/user.js";


export type ModelGenerationOptions = Pick<GPTGenerationOptions, "conversation" | "trigger" | "db" | "prompt"> & {
    /* Function to call on partial message generation */
    progress: (message: PartialResponseMessage | ChatNoticeMessage) => Promise<void> | void;

    /* List of attached images */
    images: ChatInputImage[];
}

export interface GPTGenerationOptions {
    /* Function to call on partial message generation */
    progress?: (message: ResponseMessage) => Promise<void> | void;

    /* Which conversation this generation request is for */
    conversation: Conversation;

    /* Discord message that invoked the generation */
    trigger: Message;

    /* Database instances */
    db: DatabaseInfo;

    /* Prompt to ask */
    prompt: string;
}

export type GPTImageAnalyzeOptions = GPTGenerationOptions & {
    /* Message attachment to analyze */
    attachment: ChatBaseImage;
}