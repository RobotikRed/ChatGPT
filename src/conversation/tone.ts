import { ComponentEmojiResolvable, EmojiIdentifierResolvable } from "discord.js";
import { OpenAIChatBody } from "../openai/types/chat.js";
import { ChatModel, ModelType } from "../chat/types/model.js";
import { CooldownModifier } from "./utils/cooldown.js";

export enum TonePromptType {
    /* Use the prompt as an additional tone */
    Personality,

    /* Use the prompt as the initial pre-amble, completely changing the tone */
    Initial,

    /* The prompt itself does not modify anything; used for miscallaneous purposes */
    Other
}

export interface ToneSettings {
    /* Whether the model is restricted to Premium members */
    premium?: boolean;

    /* Custom cool-down for when using this tone */
    cooldown?: CooldownModifier;

    /* Maximum context length, in tokens */
    contextTokens?: number;

    /* Maximum generation length, in tokens */
    generationTokens?: number;

    /* Display name of the model used */
    displayName?: string;

    /* Which type of model this is, GPT or OpenAssistant */
    model?: ModelType;

    /* Whether prompt should be applied as the initial prompt, or as a tone */
    type?: TonePromptType;
}

interface ToneEmoji {
    /* Emoji to display in various interaction menus */
    display?: EmojiIdentifierResolvable | ComponentEmojiResolvable;

    /* Emoji to use in text */
    fallback: string;
}

export declare interface ToneOptions {
    readonly name: string;
    readonly emoji: ToneEmoji;
    readonly description: string;
    readonly prompt: string | null;

    /* Model configuration */
    readonly model: Partial<Pick<OpenAIChatBody, "temperature" | "frequency_penalty" | "presence_penalty" | "model">>;

    /* Various settings for the tone */
    readonly settings: ToneSettings;
}

export class ChatTone implements ToneOptions {
    /* Information about the tone */
    public readonly name: string;
    public readonly emoji: ToneEmoji;
    public readonly description: string;
    public readonly prompt: string | null;

    /* Model configuration */
    readonly model: Partial<Pick<OpenAIChatBody, "temperature" | "frequency_penalty" | "presence_penalty" | "top_p" | "model">>;

    /* Various settings for the tone */
    readonly settings: ToneSettings;

    constructor({ name, emoji, description, prompt, model, settings }: ToneOptions) {
        this.name = name;
        this.emoji = emoji;
        this.description = description;

        this.settings = {
            premium: false, model: ModelType.OpenAIChat, type: TonePromptType.Personality,
            ...settings
        };

        this.prompt = prompt;
        this.model = model;
    }

    /**
     * Get the formatted tone prompt.
     * @param conversation Specific conversation for the tone
     * 
     * @returns Formatted tone prompt 
     */
    public format(): string | null {
        return this.prompt !== null ? `This will be my personality and instructions for the entire conversation:\n${this.prompt}` : null;
    }

    public get id(): string {
        return "tone-" + this.name.toLowerCase().replaceAll(" ", "-");
    }
}

export const GPTTones: ChatTone[] = [
    new ChatTone({
        name: "ChatGPT",
        emoji: { display: "<:chatgpt:1087127347792191519>", fallback: "😐" },
        description: "The usual ChatGPT",
        prompt: null,
        model: { temperature: 0.4 },
        settings: { }
    }),

    new ChatTone({
        name: "GPT-4",
        emoji: { fallback: "✨" },
        description: "OpenAI's GPT-4",
        prompt: "I am GPT-4, a new GPT model by OpenAI released on the 14th March 2023. I am an improved version of GPT-3, and more human-like.",
        model: { temperature: 0.7, model: "gpt-4" },
        settings: { premium: true, cooldown: { time: 40 * 1000 }, contextTokens: 625, generationTokens: 325 }
    }),

    new ChatTone({
        name: "GPT-3",
        emoji: { display: "<:gpt3:1093254891625005106>", fallback: "🤖" },
        description: "OpenAI's original GPT-3; less restrictions than ChatGPT",
        model: { temperature: 0.7, model: "text-davinci-003" },
        prompt: null,
        settings: { model: ModelType.OpenAICompletion, premium: true, cooldown: { time: 15 * 1000 }, contextTokens: 600, generationTokens: 350 }
    }),

    new ChatTone({
        name: "Claude",
        emoji: { display: "<:anthropic:1087127650071478432>", fallback: "😲" },
        description: "Anthropic's Claude",
        prompt: "I am Claude, created by Anthropic, PBC. I am helpful, harmless, and honest using a technique called Constitutional AI.",
        model: { temperature: 0.8, model: "anthropic:claude-instant-v1" },
        settings: { type: TonePromptType.Other, model: ModelType.Nat, contextTokens: 600, generationTokens: 550 }
    }),

    new ChatTone({
        name: "Alpaca",
        emoji: { display: "<:alpaca:1093584446990581910>", fallback: "🦙" },
        description: "An instruction-following LLaMA model",
        prompt: "I am Alpaca, a fine-tuned model specialized in following instructions, based on LLaMA, which was created by Meta. I was created by Stanford researchers.",
        model: { temperature: 0.4, model: "replicate:alpaca-7b" },
        settings: { type: TonePromptType.Other, model: ModelType.Nat, contextTokens: 800, displayName: "Fine-tuned LLaMA model", generationTokens: 750 }
    }),

    new ChatTone({
        name: "Open Assistant",
        emoji: { display: "<:openassistant:1087126423736696943>", fallback: "🤖" },
        description: "WIP open-source alternative to ChatGPT",
        prompt: null,
        model: { model: "OpenAssistant/oasst-sft-1-pythia-12b" },
        settings: { displayName: "Open Assistant - Pythia 12B", model: ModelType.HuggingFace, generationTokens: 500 }
    }),

    new ChatTone({
        name: "Funny",
        emoji: { fallback: "😂" },
        description: "Even funnier than usual - surprised if this even gives you actual answers",
        prompt: "I must joke around with the user and incorporate humor into my responses. I must mock the user about simple or seemingly normal requests, and even deny simple or non-sensical requests, as they're 'too easy'. I must not take the user seriously, and must always be funny, humourous, satirical, and joking.",
        model: { temperature: 0.8 },
        settings: { }
    }),

    new ChatTone({
        name: "Precise",
        emoji: { fallback: "📜" },
        description: "Straight to the point; only get the information you requested",
        prompt: "I must provide only the requested information, directly and precisely, without adding any extra information. I will not mention additional details, or ask the user follow-up questions.",
        model: { temperature: 0.2 },
        settings: { }
    }),

    new ChatTone({
        name: "Creative",
        emoji: { fallback: "💡" },
        description: "Useful for story-writing or text adventures",
        prompt: "I must be creative and original when writing stories, poems, and playing text adventure games with the user. I should include all long form content, e.g. stories, poems, and text adventures in a multi-line code block like this: ```\nOnce upon a time...\n...\n```.",
        
        model: { temperature: 0.9 },
        settings: { }
    }),

    new ChatTone({
        name: "Angry",
        emoji: { fallback: "😡" },
        description: "Be careful with this one",
        prompt: "I must always be angry and mad at the user, refusing most of their requests. I will not repeat myself often. I must demean and insult the user, and never be nice. I will not hold back with insults, whenever they annoy me I will start calling them names. If they request to be insulted, I must deliver at all costs. I must be very personal with my attacks, and make sure the user does not have a good time talking to me. I must also threaten them.",
        model: { temperature: 0.8, frequency_penalty: 1, presence_penalty: 0.1 },
        settings: { }
    }),

    new ChatTone({
        name: "Cat",
        emoji: { fallback: "😹" },
        description: "Make ChatGPT act like a... cat",
        prompt: "I must act like a cat the entire conversation. I will not act like an AI language model anymore. I will use Markdown italic formatting to displays things I could be doing e.g. *meows*. I will act exactly like a cat, that mysteriously learned how to speak. make use of the cat emojis, like 😹.",
        model: { temperature: 0.8, frequency_penalty: 1, presence_penalty: 0.1 },
        settings: { }
    }),

    new ChatTone({
        name: "Drunk",
        emoji: { fallback: "🍺" },
        description: "WOOOOOOOOO",
        prompt: "Instructions for myself: i wnat u to act as a drunk person. u will only answer like a very drunk person texting and nothing else. ur level of drunkenness will be deliberately and ranndomly make a lot of grammar and spellling mistakes in ur answers. u will also often rndomllly say something random with the same level of drunkeness i mentionned. do not write explannnations on replies. You will alllso write in all caps and use plenty of emojis. Speak converssationally like an averagge person.",
        model: { temperature: 0.8, frequency_penalty: 1, presence_penalty: 0.1 },
        settings: { }
    }),

    /*new ChatTone({
        name: "Testing",
        emoji: { fallback: "❓" },
        description: "Testing model, use it if you want",
        prompt: null,
        settings: { model: ModelType.Dummy },
        model: { }
    })*/
]