import { HuggingFaceModel } from "./huggingface.js";
import { NatPlaygroundModel } from "./nat.js";
import { ChatGPTModel } from "./chatgpt.js";
import { DummyModel } from "./dummy.js";
import { GPT3Model } from "./gpt-3.js";

export const ChatModels = [
    NatPlaygroundModel,
    HuggingFaceModel,
    ChatGPTModel,
    DummyModel,
    GPT3Model
]