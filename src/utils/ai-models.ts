import * as models from "../services/ai/providers";

export interface AIModelOption {
  label: string;
  value: string;
  description: string;
}

export const AI_MODEL_OPTIONS: AIModelOption[] = [
  {
    label: "o3 Mini",
    value: "o3-mini",
    description:
      "Fast, cost-efficient reasoning model with strong performance on math, coding and vision",
  },
  {
    label: "o3",
    value: "o3",
    description:
      "Most powerful reasoning model with leading performance on coding, math, science, and vision",
  },
  {
    label: "o3 Mini High",
    value: "o3-mini-high",
    description: "Higher performance version of O3 Mini for more complex reasoning tasks",
  },
  {
    label: "o3 Pro",
    value: "o3-pro",
    description: "Professional version of O3 with enhanced capabilities for enterprise use",
  },
  {
    label: "GPT-4.1",
    value: "gpt-4.1",
    description: "Smartest non-reasoning model from OpenAI for complex tasks",
  },
  {
    label: "GPT-4.1 Mini",
    value: "gpt-4.1-mini",
    description: "Smaller, faster version of GPT-4.1 for lighter tasks",
  },
  {
    label: "GPT-4.1 Nano",
    value: "gpt-4.1-nano",
    description: "Ultra-compact version of GPT-4.1 for simple tasks",
  },
  {
    label: "Claude Sonnet 4",
    value: "claude-sonnet-4",
    description:
      "Anthropic's latest Claude model with excellent reasoning and writing capabilities",
  },
  {
    label: "Claude Opus 4",
    value: "claude-opus-4",
    description: "Anthropic's most powerful Claude model for complex reasoning and analysis",
  },
  {
    label: "Kimi K2",
    value: "kimi-k2",
    description: "Moonshot AI's advanced language model with strong multilingual capabilities",
  },
  {
    label: "Kimi K2 (Free)",
    value: "kimi-k2-free",
    description: "Free tier version of Kimi K2 with usage limitations",
  },
  {
    label: "DeepSeek Chat V3",
    value: "deepseek-chat-v3",
    description: "Advanced conversational AI model from DeepSeek with strong reasoning",
  },
  {
    label: "DeepSeek Chat V3 (Free)",
    value: "deepseek-chat-v3-free",
    description: "Free tier version of DeepSeek Chat V3 with usage limitations",
  },
  {
    label: "DeepSeek R1",
    value: "deepseek-r1",
    description: "DeepSeek's reasoning-focused model for complex problem solving",
  },
  {
    label: "DeepSeek R1 (Free)",
    value: "deepseek-r1-free",
    description: "Free tier version of DeepSeek R1 with usage limitations",
  },
  {
    label: "Perplexity Sonar",
    value: "sonar",
    description: "Perplexity's fast search-enhanced AI model for real-time information",
  },
  {
    label: "Perplexity Sonar Pro",
    value: "sonar-pro",
    description: "Enhanced version of Sonar with better reasoning and search capabilities",
  },
  {
    label: "Perplexity Sonar Reasoning Pro",
    value: "sonar-reasoning-pro",
    description: "Advanced reasoning version of Sonar Pro for complex analysis",
  },
  {
    label: "Perplexity R1-1776",
    value: "r1-1776",
    description: "Perplexity's specialized reasoning model for in-depth analysis",
  },
  {
    label: "Perplexity Sonar Deep Research",
    value: "sonar-deep-research",
    description: "Deep research-focused model for comprehensive information gathering",
  },
  {
    label: "Gemini 2.5 Flash Lite",
    value: "gemini-2.5-flash-lite",
    description: "Google's lightweight, fast multimodal model for quick tasks",
  },
  {
    label: "Gemini 2.5 Flash",
    value: "gemini-2.5-flash",
    description: "Google's balanced multimodal model with good speed and capability",
  },
  {
    label: "Gemini 2.5 Pro",
    value: "gemini-2.5-pro",
    description: "Google's most advanced multimodal model for complex tasks",
  },
  {
    label: "Grok-4",
    value: "grok-4",
    description: "X.AI's latest language model with real-time information access",
  },
];

export const AI_MODEL_MAP = {
  "o4-mini": { model: models.o4Mini, name: "O4 Mini" },
  o3: { model: models.o3, name: "O3" },
  "o4-mini-high": { model: models.o4MiniHigh, name: "O4 Mini High" },
  "o3-pro": { model: models.o3Pro, name: "O3 Pro" },
  "gpt-4.1": { model: models.gpt4Dot1, name: "GPT-4.1" },
  "gpt-4.1-mini": { model: models.gpt4Dot1Mini, name: "GPT-4.1 Mini" },
  "gpt-4.1-nano": { model: models.gpt4Dot1Nano, name: "GPT-4.1 Nano" },
  "claude-sonnet-4": { model: models.claudeSonnet4, name: "Claude Sonnet 4" },
  "claude-opus-4": { model: models.claudeOpus4, name: "Claude Opus 4" },
  "kimi-k2": { model: models.kimiK2, name: "Kimi K2" },
  "kimi-k2-free": { model: models.kimiK2Free, name: "Kimi K2 (Free)" },
  "deepseek-chat-v3": { model: models.deepseekChatV3, name: "DeepSeek Chat V3" },
  "deepseek-chat-v3-free": { model: models.deepseekChatV3Free, name: "DeepSeek Chat V3 (Free)" },
  "deepseek-r1": { model: models.deepseekR1, name: "DeepSeek R1" },
  "deepseek-r1-free": { model: models.deepseekR1Free, name: "DeepSeek R1 (Free)" },
  sonar: { model: models.sonar, name: "Perplexity Sonar" },
  "sonar-pro": { model: models.sonarPro, name: "Perplexity Sonar Pro" },
  "sonar-reasoning-pro": {
    model: models.sonarReasoningPro,
    name: "Perplexity Sonar Reasoning Pro",
  },
  "r1-1776": { model: models.r1_1776, name: "Perplexity R1-1776" },
  "sonar-deep-research": {
    model: models.sonarDeepResearch,
    name: "Perplexity Sonar Deep Research",
  },
  "gemini-2.5-flash-lite": { model: models.gemini2Dot5FlashLite, name: "Gemini 2.5 Flash Lite" },
  "gemini-2.5-flash": { model: models.gemini2Dot5Flash, name: "Gemini 2.5 Flash" },
  "gemini-2.5-pro": { model: models.gemini2Dot5Pro, name: "Gemini 2.5 Pro" },
  "grok-4": { model: models.grok4, name: "Grok-4" },
};

export type AIModelKey = keyof typeof AI_MODEL_MAP;

export function getModelByKey(key: string): { model: any; name: string } {
  const modelKey = key as AIModelKey;
  const modelInfo = AI_MODEL_MAP[modelKey];
  if (!modelInfo) {
    throw new Error(`Unknown model key: ${key}`);
  }
  return modelInfo;
}
