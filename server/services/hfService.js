import { buildChatMessages } from './promptService.js';
import { analyzeImages, generateImage } from './imageService.js';
import { extractImageGenPrompt, wantsImageGeneration } from '../utils/images.js';
import {
  buildChatCompletionsUrl,
  fetchWithTimeout,
  readApiError,
  sleep,
} from './hfClient.js';

const DEFAULT_TIMEOUT_MS = 15000;
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
 */

/**
 * @typedef {Object} HFConfigOverrides
 * @property {string} [token]
 * @property {string} [model]
 * @property {string} [endpoint]
 * @property {string} [visionModel]
 * @property {string} [imageGenModel]
 */

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
  const timeoutMs = Number(process.env.HF_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  if (!token) {
    throw new Error('API key is required. Set it in the UI settings or HF_TOKEN env variable.');
  }

  return { token, model, endpoint, visionModel, imageGenModel, timeoutMs };
}

/**
 * Call Hugging Face Inference Providers chat completions API.
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} newMessage
 * @param {HFConfig} config
 * @returns {Promise<string>}
 */
export async function generateResponse(history, newMessage, config) {
  const url = buildChatCompletionsUrl(config.endpoint || undefined);
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
            max_tokens: 512,
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
      return extractChatCompletionText(data);
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
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} newMessage
 * @param {HFConfig} config
 * @param {string[]} [images]
 * @returns {Promise<{ text: string, images: string[] }>}
 */
export async function chat(history, newMessage, config, images = []) {
  const textParts = [];
  const outputImages = [];
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
    textParts.push(await generateResponse(history, trimmedMessage, config));
  }

  return {
    text: textParts.join('\n\n') || 'Done.',
    images: outputImages,
  };
}

/**
 * @param {unknown} data
 * @returns {string}
 */
function extractChatCompletionText(data) {
  if (typeof data === 'object' && data !== null) {
    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content === 'string') {
      return content.trim();
    }
    if (typeof choice?.text === 'string') {
      return choice.text.trim();
    }
    if ('error' in data && typeof data.error === 'object' && data.error?.message) {
      throw new Error(data.error.message);
    }
  }

  throw new Error('Unexpected chat completion response format');
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
    `- Use a Hugging Face token with **Inference Providers** permission\n` +
    `- Pick a model available on Inference Providers (e.g. \`Qwen/Qwen2.5-7B-Instruct\`)\n\n` +
    `_(Error: ${message})_`
  );
}
