export const HF_ROUTER_CHAT_URL =
  process.env.HF_CHAT_URL || 'https://router.huggingface.co/v1/chat/completions';

export const HF_ROUTER_INFERENCE_BASE =
  process.env.HF_INFERENCE_URL || 'https://router.huggingface.co/hf-inference/models';

/**
 * @param {string} model
 * @param {string} [customEndpoint]
 */
export function buildInferenceModelUrl(model, customEndpoint) {
  if (customEndpoint) {
    return customEndpoint.replace(/\/$/, '');
  }
  return `${HF_ROUTER_INFERENCE_BASE}/${model}`;
}

/**
 * @param {string} [customEndpoint]
 */
export function buildChatCompletionsUrl(customEndpoint) {
  if (customEndpoint) {
    const base = customEndpoint.replace(/\/$/, '');
    if (base.includes('/chat/completions')) return base;
    return `${base}/v1/chat/completions`;
  }
  return HF_ROUTER_CHAT_URL;
}

/**
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs
 */
export async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {Response} response
 * @param {string} label
 */
export async function readApiError(response, label = 'HF API') {
  const errorBody = await response.text();
  let message = errorBody;

  try {
    const parsed = JSON.parse(errorBody);
    message =
      parsed?.error?.message ||
      parsed?.error ||
      parsed?.message ||
      errorBody;
  } catch {
    // keep raw body
  }

  if (response.status === 404 && label !== 'Local LLM') {
    message += '. The legacy api-inference.huggingface.co endpoint is retired — use Inference Providers (router.huggingface.co) and a supported model.';
  }

  if ((response.status === 401 || response.status === 403) && label !== 'Local LLM') {
    message +=
      '. Ensure your HF token has "Make calls to Inference Providers" permission at https://huggingface.co/settings/tokens';
  }

  throw new Error(`${label} error (${response.status}): ${message}`);
}
