import { buildPrompt } from './promptService.js';
import { analyzeImages, generateImage } from './imageService.js';
import { extractImageGenPrompt, wantsImageGeneration } from '../utils/images.js';

const DEFAULT_HF_API_BASE = 'https://api-inference.huggingface.co/models';
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
  const model = overrides.model || process.env.HF_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2';
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
 * Call Hugging Face Inference API with retry logic.
 * @param {string} prompt
 * @param {HFConfig} [config]
 * @returns {Promise<string>}
 */
export async function generateResponse(prompt, config) {
  const url = config.endpoint
    ? config.endpoint.replace(/\/$/, '')
    : `${DEFAULT_HF_API_BASE}/${config.model}`;
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
            inputs: prompt,
            parameters: {
              max_new_tokens: 512,
              return_full_text: false,
              temperature: 0.7,
            },
          }),
        },
        config.timeoutMs
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HF API error (${response.status}): ${errorBody}`);
      }

      const data = await response.json();
      return extractGeneratedText(data);
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
    const prompt = buildPrompt(history, trimmedMessage);
    textParts.push(await generateResponse(prompt, config));
  }

  return {
    text: textParts.join('\n\n') || 'Done.',
    images: outputImages,
  };
}

/**
 * Extract generated text from various HF response formats.
 * @param {unknown} data
 * @returns {string}
 */
function extractGeneratedText(data) {
  if (Array.isArray(data)) {
    const first = data[0];
    if (typeof first?.generated_text === 'string') {
      return first.generated_text.trim();
    }
    if (typeof first?.summary_text === 'string') {
      return first.summary_text.trim();
    }
  }

  if (typeof data === 'object' && data !== null) {
    if ('generated_text' in data && typeof data.generated_text === 'string') {
      return data.generated_text.trim();
    }
    if ('error' in data && typeof data.error === 'string') {
      throw new Error(data.error);
    }
  }

  if (typeof data === 'string') {
    return data.trim();
  }

  throw new Error('Unexpected HF API response format');
}

/**
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`HF API request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Graceful fallback when the model is unavailable.
 * @param {Error} error
 * @returns {string}
 */
export function getFallbackResponse(error) {
  const message = error?.message ?? 'Unknown error';
  return `I'm sorry, I'm having trouble connecting to the AI model right now. Please try again in a moment.\n\n_(Error: ${message})_`;
}
