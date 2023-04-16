import { OpenAIChatCompletionsData, OpenAIPartialCompletionsJSON } from "../../openai/types/chat.js";
import { ChatModel, ConstructorModelOptions, ModelCapability, ModelType } from "../types/model.js";
import { GPTGenerationError, GPTGenerationErrorType } from "../../error/gpt/generation.js";
import { ModelGenerationOptions } from "../types/options.js";
import { PartialResponseMessage } from "../types/message.js";
import { ChatClient, PromptData } from "../client.js";

export class ChatGPTModel extends ChatModel {
    constructor(client: ChatClient, options?: ConstructorModelOptions) {
        super(client, options ?? {
            name: "ChatGPT",
            type: ModelType.OpenAIChat,

            capabilities: [ ModelCapability.ImageViewing ]
        });
    }

    /**
     * Make the actual call to the OpenAI API, to generate a response for the given prompt.
     * This always concatenates the history & starting prompt.
     * 
     * @param options Generation options
     * @returns Generated response
     */
    private async chat(options: ModelGenerationOptions, progress?: (response: OpenAIPartialCompletionsJSON) => Promise<void> | void): Promise<OpenAIChatCompletionsData | null> {
        const prompt: PromptData = await this.client.buildPrompt(options, "ChatGPT");

        const data: OpenAIChatCompletionsData = await this.client.session.ai.chat({
            model: options.conversation.tone.model.model ?? "gpt-3.5-turbo",
            stop: "Human:",
            stream: true,

            user: options.conversation.userIdentifier,

            temperature: options.conversation.tone.model.temperature ?? 0.5,
            max_tokens: isFinite(prompt.max) ? prompt.max : undefined,
            messages: Object.values(prompt.parts),
        }, progress, this.client.session.manager.bot.db.users.canUsePremiumFeatures(options.db) ? "Official" : "Bypass");

        if (data.response.message.content.trim().length === 0) return null;
        return data;
    }

    public async complete({ progress, conversation, prompt, trigger, db, images }: ModelGenerationOptions): Promise<PartialResponseMessage> {
        const data: OpenAIChatCompletionsData | null = await this.chat({
            conversation, prompt, trigger, db, progress, images
        }, response => progress({ text: response.choices[0].delta.content! }));

        if (data === null) throw new GPTGenerationError({ type: GPTGenerationErrorType.Empty });

        return {
            raw: {
                finishReason: data.response.finish_reason ? data.response.finish_reason === "length" ? "maxLength" : "stop" : null,
                
                usage: {
                    completion: data.usage.completion_tokens,
                    prompt: data.usage.prompt_tokens
                }
            },

            text: data.response.message.content
        };
    }
}