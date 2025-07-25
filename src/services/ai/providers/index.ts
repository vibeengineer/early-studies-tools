import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const o4Mini = openrouter.chat("openai/o4-mini");
export const o3 = openrouter.chat("openai/o3");
export const o4MiniHigh = openrouter.chat("openai/o4-mini");
export const o3Pro = openrouter.chat("openai/o3-pro");
export const gpt4Dot1 = openrouter.chat("openai/gpt-4.1");
export const gpt4Dot1Mini = openrouter.chat("openai/gpt-4.1-mini");
export const gpt4Dot1Nano = openrouter.chat("openai/gpt-4.1-nano");
export const claudeSonnet4 = openrouter.chat("anthropic/claude-sonnet-4");
export const claudeOpus4 = openrouter.chat("anthropic/claude-opus-4");
export const kimiK2 = openrouter.chat("moonshotai/kimi-k2");
export const deepseekChatV3Free = openrouter.chat("deepseek/deepseek-chat-v3-0324:free");
export const kimiK2Free = openrouter.chat("moonshotai/kimi-k2:free");
export const deepseekChatV3 = openrouter.chat("deepseek/deepseek-chat-v3-0324");
export const deepseekR1Free = openrouter.chat("deepseek/deepseek-r1-0528:free");
export const deepseekR1 = openrouter.chat("deepseek/deepseek-r1-0528");
export const sonar = openrouter.chat("perplexity/sonar");
export const sonarPro = openrouter.chat("perplexity/sonar-pro");
export const sonarReasoningPro = openrouter.chat("perplexity/sonar-reasoning-pro");
export const r1_1776 = openrouter.chat("perplexity/r1-1776");
export const sonarDeepResearch = openrouter.chat("perplexity/sonar-deep-research");
export const gemini2Dot5FlashLite = openrouter.chat("google/gemini-2.5-flash-lite");
export const gemini2Dot5Flash = openrouter.chat("google/gemini-2.5-flash");
export const gemini2Dot5Pro = openrouter.chat("google/gemini-2.5-pro");
export const grok4 = openrouter.chat("x-ai/grok-4");
