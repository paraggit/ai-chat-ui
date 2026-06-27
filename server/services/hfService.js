import { buildChatMessages, buildPrompt } from './promptService.js';
import { analyzeImages, generateImage } from './imageService.js';
import { extractImageGenPrompt, wantsImageGeneration } from '../utils/images.js';
import { parseModelResponse } from './responseParser.js';
import {
  buildChatCompletionsUrl,
  fetchWithTimeout,
  HF_ROUTER_CHAT_URL,
  readApiError,
  sleep,
} from './hfClient.js';

const DEFAULT_TIMEOUT_MS = 15000;
const CUSTOM_ENDPOINT_TIMEOUT_MS = 180000;
const DEFAULT_MAX_TOKENS = 4096;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

/**
 * @typedef {Object} HFConfig
 * @property {string} token
 * @property {string} model
 * @property {string} [endpoint]
 * @property {string} visionModel
 * @property {string} imageGenModel
 * @property {number} timeoutMs
 * @property {number} maxTokens
 */

/**
 * @typedef {Object} HFConfigOverrides
 * @property {string} [token]
 * @property {string} [model]
 * @property {string} [endpoint]
 * @property {string} [visionModel]
 * @property {string} [imageGenModel]
 * @property {number} [maxTokens]
 */

/**
 * @param {string} [endpoint]
 */
export function isCustomEndpoint(endpoint) {
  return Boolean(endpoint?.trim());
}

/**
 * @param {number | string | undefined} override
 */
function resolveMaxTokens(override) {
  const fromEnv = Number(process.env.HF_MAX_TOKENS);
  const fallback = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_MAX_TOKENS;
  if (override === undefined || override === null || override === '') {
    return fallback;
  }
  const value = Number(override);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.max(Math.floor(value), 1), 131072);
}

/**
 * Resolve HF config from request overrides with env fallbacks.
 * @param {HFConfigOverrides} [overrides]
 * @returns {HFConfig}
 */
export function resolveHFConfig(overrides = {}) {
  const token = overrides.token || process.env.HF_TOKEN;
  const model = overrides.model || process.env.HF_MODEL || 'Qwen/Qwen2.5-7B-Instruct';
  const endpoint = overrides.endpoint || process.env.HF_API_BASE || '';
  const visionModel = overrides.visionModel || process.env.HF_VISION_MODEL || 'Salesforce/blip-vqa-base';
  const imageGenModel =
    overrides.imageGenModel || process.env.HF_IMAGE_GEN_MODEL || 'stabilityai/stable-diffusion-2-1';
  const baseTimeout = Number(process.env.HF_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const timeoutMs = isCustomEndpoint(endpoint)
    ? Number(process.env.HF_ENDPOINT_TIMEOUT_MS) || Math.max(baseTimeout, CUSTOM_ENDPOINT_TIMEOUT_MS)
    : baseTimeout;
  const maxTokens = resolveMaxTokens(overrides.maxTokens);

  if (!token) {
    throw new Error('API key is required. Set it in the UI settings or HF_TOKEN env variable.');
  }

  return { token, model, endpoint, visionModel, imageGenModel, timeoutMs, maxTokens };
}

/**
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} newMessage
 * @param {HFConfig} config
 * @returns {Promise<ParsedModelResponse>}
 */
export async function generateResponse(history, newMessage, config) {
  if (isCustomEndpoint(config.endpoint)) {
    return generateViaCustomEndpoint(history, newMessage, config);
  }

  return generateViaRouter(history, newMessage, config);
}

/**
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} newMessage
 * @param {HFConfig} config
 */
async function generateViaRouter(history, newMessage, config) {
  const url = HF_ROUTER_CHAT_URL;
  const messages = buildChatMessages(history, newMessage);
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            max_tokens: config.maxTokens,
            temperature: 0.7,
            stream: false,
          }),
        },
        config.timeoutMs
      );

      if (!response.ok) {
        await readApiError(response, 'Chat API');
      }

      const data = await response.json();
      const parsed = parseModelResponse(data);
      console.log(`[hfService] Router success (${parsed.content.length} chars)`);
      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error('Unknown HF API error');
}

/**
 * Try multiple request formats against a dedicated Inference Endpoint.
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} newMessage
 * @param {HFConfig} config
 */
async function generateViaCustomEndpoint(history, newMessage, config) {
  const base = config.endpoint.replace(/\/$/, '');
  const messages = buildChatMessages(history, newMessage);
  const prompt = buildPrompt(history, newMessage);

  /** @type {Array<{ name: string, url: string, body: object }>} */
  const strategies = [
    {
      name: 'OpenAI /v1/chat/completions',
      url: `${base}/v1/chat/completions`,
      body: {
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature: 0.7,
        stream: false,
      },
    },
    {
      name: 'TGI root (inputs prompt)',
      url: base,
      body: {
        inputs: prompt,
        parameters: {
          max_new_tokens: config.maxTokens,
          temperature: 0.7,
          return_full_text: false,
        },
      },
    },
    {
      name: 'TGI /generate',
      url: `${base}/generate`,
      body: {
        inputs: prompt,
        parameters: {
          max_new_tokens: config.maxTokens,
          temperature: 0.7,
          return_full_text: false,
        },
      },
    },
    {
      name: 'OpenAI root /chat/completions',
      url: buildChatCompletionsUrl(base),
      body: {
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature: 0.7,
        stream: false,
      },
    },
  ];

  /** @type {Error[]} */
  const errors = [];

  for (const strategy of strategies) {
    try {
      console.log(`[hfService] Trying ${strategy.name} → ${strategy.url}`);

      const response = await fetchWithTimeout(
        strategy.url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(strategy.body),
        },
        config.timeoutMs
      );

      if (!response.ok) {
        const errorBody = await response.text();
        errors.push(new Error(`${strategy.name} (${response.status}): ${errorBody.slice(0, 300)}`));
        continue;
      }

      const data = await response.json();
      const parsed = parseModelResponse(data, { strategy: strategy.name });
      console.log(`[hfService] Success via ${strategy.name} (${parsed.content.length} chars)`);
      return parsed;
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  const detail = errors.map((e) => e.message).join(' | ');
  throw new Error(`All endpoint strategies failed for ${base}. ${detail}`);
}

/**
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} newMessage
 * @param {HFConfig} config
 * @param {string[]} [images]
 * @returns {Promise<{ text: string, metadata: Record<string, unknown> | null, images: string[] }>}
 */
export async function chat(history, newMessage, config, images = []) {
  const textParts = [];
  const outputImages = [];
  /** @type {Record<string, unknown> | null} */
  let responseMetadata = null;
  const trimmedMessage = newMessage.trim();
  const visionQuestion = trimmedMessage || 'Describe this image in detail.';

  if (images.length > 0) {
    const visionText = await analyzeImages(images, visionQuestion, config);
    textParts.push(visionText);
  }

  if (wantsImageGeneration(trimmedMessage)) {
    const genPrompt = extractImageGenPrompt(trimmedMessage) || visionQuestion;
    const generated = await generateImage(genPrompt, config);
    outputImages.push(generated);
    textParts.push(`Here is the generated image for: *${genPrompt}*`);
  }

  if (images.length === 0 && !wantsImageGeneration(trimmedMessage)) {
    const llmResult = await generateResponse(history, trimmedMessage, config);
    textParts.push(llmResult.content);
    responseMetadata = llmResult.metadata;
  }

  return {
    text: textParts.join('\n\n') || 'Done.',
    metadata: responseMetadata,
    images: outputImages,
  };
}

/**
 * Graceful fallback when the model is unavailable.
 * @param {Error} error
 * @returns {string}
 */
export function getFallbackResponse(error) {
  const message = error?.message ?? 'Unknown error';
  return (
    `I'm sorry, I'm having trouble connecting to the AI model right now. Please try again in a moment.\n\n` +
    `**Tips:**\n` +
    `- For **Inference Endpoints**, use your endpoint URL in settings (e.g. \`https://xxx.aws.endpoints.huggingface.cloud\`)\n` +
    `- Large models may take 1–3 minutes on cold start\n` +
    `- Ensure your HF token has access to the endpoint\n` +
    `- For public models, use Inference Providers token permission\n\n` +
    `_(Error: ${message})_`
  );
}
