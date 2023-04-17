import { setTimeout } from "timers/promises";

import { ChatModel, ModelCapability, ModelType } from "../types/model.js";
import { GPTImageAnalyzeOptions, ModelGenerationOptions } from "../types/options.js";
import { PartialResponseMessage } from "../types/message.js";
import { ChatAnalyzedImage, ImageBuffer } from "../types/image.js";
import { ChatClient } from "../client.js";

export class DummyModel extends ChatModel {
    constructor(client: ChatClient) {
        super(client, {
            name: "Dummy",
            type: ModelType.Dummy,

            capabilities: [ ModelCapability.ImageViewing ]
        });
    }

    public async complete(options: ModelGenerationOptions): Promise<PartialResponseMessage> {
        /* Build prompt ... */
        //const prompt = await this.client.buildPrompt(options, "ChatGPT");
        
        /* Run generation */

        return {
            text: `${Math.random()}`,
            raw: {
                finishReason: "maxLength",
                usage: null
            }
        };
    }
}