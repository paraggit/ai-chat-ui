import { buildChatMessages, buildPrompt } from './promptService.js';
import { analyzeImages, generateImage } from './imageService.js';
import { extractImageGenPrompt, wantsImageGeneration } from '../utils/images.js';
import { parseModelResponse } from './responseParser.js';
import { streamOpenAiChatCompletions } from './openaiStream.js';
import {
  buildChatCompletionsUrl,
  fetchWithTimeout,
  HF_ROUTER_CHAT_URL,
  readApiError,
  sleep,
} from './hfClient.js';

const DEFAULT_TIMEOUT_MS = 15000;
const CUSTOM_ENDPOINT_TIMEOUT_MS = 180000;
const LOCAL_LLM_TIMEOUT_MS = 120000;
const DEFAULT_MAX_TOKENS = 8192;
const LOCAL_LLM_DEFAULT_URL = 'http://localhost:11434';
const LOCAL_LLM_DEFAULT_MODEL = 'llama3.2';
const PROVIDER_LOCAL = 'local';
const PROVIDER_HF = 'huggingface';
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

/**
 * @typedef {Object} HFConfig
 * @property {string} token
 * @property {string} model
 * @property {string} [endpoint]
 * @property {string} visionModel
 * @property {string} imageGenModel
 * @property {string} provider
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
 * @property {string} [provider]
 * @property {number} [maxTokens]
 */

/**
 * @param {string} [endpoint]
 */
export function isCustomEndpoint(endpoint) {
  return Boolean(endpoint?.trim());
}

/**
 * @param {string} [provider]
 */
export function isLocalProvider(provider) {
  return provider === PROVIDER_LOCAL;
}

/**
 * @param {string} token
 * @param {Record<string, string>} headers
 */
function applyAuthHeader(token, headers) {
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
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
  const provider =
    overrides.provider === PROVIDER_LOCAL
      ? PROVIDER_LOCAL
      : overrides.provider === PROVIDER_HF
        ? PROVIDER_HF
        : process.env.LLM_PROVIDER === PROVIDER_LOCAL
          ? PROVIDER_LOCAL
          : PROVIDER_HF;
  const token = overrides.token || process.env.HF_TOKEN || '';
  let model =
    overrides.model ||
    (provider === PROVIDER_LOCAL ? process.env.LOCAL_LLM_MODEL : process.env.HF_MODEL) ||
    (provider === PROVIDER_LOCAL ? LOCAL_LLM_DEFAULT_MODEL : 'Qwen/Qwen2.5-7B-Instruct');
  let endpoint =
    overrides.endpoint ||
    (provider === PROVIDER_LOCAL ? process.env.LOCAL_LLM_URL : process.env.HF_API_BASE) ||
    (provider === PROVIDER_LOCAL ? LOCAL_LLM_DEFAULT_URL : '');
  const visionModel = overrides.visionModel || process.env.HF_VISION_MODEL || 'Salesforce/blip-vqa-base';
  const imageGenModel =
    overrides.imageGenModel || process.env.HF_IMAGE_GEN_MODEL || 'stabilityai/stable-diffusion-2-1';
  const baseTimeout = Number(process.env.HF_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const localTimeout = Number(process.env.LOCAL_LLM_TIMEOUT_MS) || LOCAL_LLM_TIMEOUT_MS;
  const timeoutMs =
    provider === PROVIDER_LOCAL
      ? localTimeout
      : isCustomEndpoint(endpoint)
        ? Number(process.env.HF_ENDPOINT_TIMEOUT_MS) ||
          Math.max(baseTimeout, CUSTOM_ENDPOINT_TIMEOUT_MS)
        : baseTimeout;
  const maxTokens = resolveMaxTokens(overrides.maxTokens);

  if (provider !== PROVIDER_LOCAL && !token) {
    throw new Error('API key is required. Set it in the UI settings or HF_TOKEN env variable.');
  }

  if (provider === PROVIDER_LOCAL && !model.trim()) {
    throw new Error('Local model name is required (e.g. llama3.2).');
  }

  return {
    token: token.trim(),
    model: model.trim(),
    endpoint: endpoint.trim(),
    visionModel,
    imageGenModel,
    provider,
    timeoutMs,
    maxTokens,
  };
}

/**
 * @typedef {Object} StreamHandlers
 * @property {(token: string) => void} onToken
 * @property {(metadata: Record<string, unknown>) => void} [onMetadata]
 */

function buildChatRequestBody(config, messages, overrides = {}) {
  const body = {
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature: overrides.temperature ?? 0.7,
    stream: overrides.stream ?? false,
  };
  if (isLocalProvider(config.provider)) {
    body.options = { num_predict: config.maxTokens };
  }
  return body;
}

/**
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} newMessage
 * @param {HFConfig} config
 * @param {StreamHandlers} handlers
 * @param {Array<{ role: string, content: string }>} [apiMessages]
 */
async function streamGenerateResponse(history, newMessage, config, handlers, apiMessages) {
  const messages = apiMessages ?? buildChatMessages(history, newMessage);
  const body = buildChatRequestBody(config, messages, { stream: true });
  console.log(`[hfService] Output limit: max_tokens=${config.maxTokens}`);

  if (isLocalProvider(config.provider)) {
    /** @type {Record<string, string>} */
    const headers = { 'Content-Type': 'application/json' };
    applyAuthHeader(config.token, headers);
    const url = buildChatCompletionsUrl(config.endpoint);
    console.log(`[hfService] Local LLM stream → ${url} (model: ${config.model})`);
    const result = await streamOpenAiChatCompletions(url, headers, body, handlers, {
      strategy: 'local-openai-stream',
      label: 'Local LLM',
      timeoutMs: config.timeoutMs,
    });
    console.log(`[hfService] Local LLM stream success (${result.content.length} chars)`);
    return result;
  }

  if (isCustomEndpoint(config.endpoint)) {
    const base = config.endpoint.replace(/\/$/, '');
    const headers = {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    };
    const urls = [
      { url: `${base}/v1/chat/completions`, strategy: 'openai-stream' },
      { url: buildChatCompletionsUrl(base), strategy: 'openai-stream-alt' },
    ];

    /** @type {Error | null} */
    let lastError = null;
    for (const { url, strategy } of urls) {
      try {
        console.log(`[hfService] Streaming ${strategy} → ${url}`);
        const result = await streamOpenAiChatCompletions(url, headers, body, handlers, {
          strategy,
          label: 'Inference endpoint',
          timeoutMs: config.timeoutMs,
        });
        console.log(`[hfService] Stream success via ${strategy} (${result.content.length} chars)`);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    console.warn('[hfService] Streaming failed, falling back to non-stream endpoint strategies');
    const parsed = await generateViaCustomEndpoint(history, newMessage, config);
    if (parsed.content) {
      handlers.onToken(parsed.content);
    }
    if (parsed.metadata && handlers.onMetadata) {
      handlers.onMetadata(parsed.metadata);
    }
    if (lastError && !parsed.content) {
      throw lastError;
    }
    return parsed;
  }

  const headers = {
    Authorization: `Bearer ${config.token}`,
    'Content-Type': 'application/json',
  };
  const result = await streamOpenAiChatCompletions(HF_ROUTER_CHAT_URL, headers, body, handlers, {
    strategy: 'hf-router-stream',
    label: 'Chat API',
    timeoutMs: config.timeoutMs,
  });
  console.log(`[hfService] Router stream success (${result.content.length} chars)`);
  return result;
}

/**
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} newMessage
 * @param {HFConfig} config
 * @returns {Promise<ParsedModelResponse>}
 */
export async function generateResponse(history, newMessage, config) {
  if (isLocalProvider(config.provider)) {
    return generateViaLocalLlm(history, newMessage, config);
  }

  if (isCustomEndpoint(config.endpoint)) {
    return generateViaCustomEndpoint(history, newMessage, config);
  }

  return generateViaRouter(history, newMessage, config);
}

/**
 * OpenAI-compatible local server (Ollama, llama.cpp, LM Studio, etc.).
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} newMessage
 * @param {HFConfig} config
 */
async function generateViaLocalLlm(history, newMessage, config) {
  const url = buildChatCompletionsUrl(config.endpoint);
  const messages = buildChatMessages(history, newMessage);
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      /** @type {Record<string, string>} */
      const headers = { 'Content-Type': 'application/json' };
      applyAuthHeader(config.token, headers);

      console.log(`[hfService] Local LLM → ${url} (model: ${config.model})`);

      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers,
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
        await readApiError(response, 'Local LLM');
      }

      const data = await response.json();
      const parsed = parseModelResponse(data, { strategy: 'local-openai' });
      console.log(`[hfService] Local LLM success (${parsed.content.length} chars)`);
      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error('Local LLM request failed');
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
 * Non-streaming completion with a pre-built messages array (used for summarization).
 * @param {Array<{ role: string, content: string }>} messages
 * @param {HFConfig} config
 * @param {{ maxTokens?: number, label?: string }} [options]
 * @returns {Promise<import('./responseParser.js').ParsedModelResponse>}
 */
export async function completeMessages(messages, config, options = {}) {
  const maxTokens = options.maxTokens ?? 512;
  const label = options.label || 'Chat API';
  const body = {
    model: config.model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.3,
    stream: false,
  };

  if (isLocalProvider(config.provider)) {
    /** @type {Record<string, string>} */
    const headers = { 'Content-Type': 'application/json' };
    applyAuthHeader(config.token, headers);
    const url = buildChatCompletionsUrl(config.endpoint);
    const response = await fetchWithTimeout(
      url,
      { method: 'POST', headers, body: JSON.stringify(body) },
      config.timeoutMs
    );
    if (!response.ok) await readApiError(response, label);
    const data = await response.json();
    return parseModelResponse(data, { strategy: 'completion-local' });
  }

  if (isCustomEndpoint(config.endpoint)) {
    const base = config.endpoint.replace(/\/$/, '');
    const headers = {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    };
    const urls = [`${base}/v1/chat/completions`, buildChatCompletionsUrl(base)];
    /** @type {Error | null} */
    let lastError = null;

    for (const url of urls) {
      try {
        const response = await fetchWithTimeout(
          url,
          { method: 'POST', headers, body: JSON.stringify(body) },
          config.timeoutMs
        );
        if (!response.ok) {
          lastError = new Error(`${label} error (${response.status})`);
          continue;
        }
        const data = await response.json();
        return parseModelResponse(data, { strategy: 'completion-endpoint' });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError ?? new Error(`${label} completion failed`);
  }

  const response = await fetchWithTimeout(
    HF_ROUTER_CHAT_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    config.timeoutMs
  );

  if (!response.ok) {
    await readApiError(response, label);
  }

  const data = await response.json();
  return parseModelResponse(data, { strategy: 'completion-router' });
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
 * @param {StreamHandlers} [streamHandlers]
 * @param {Array<{ role: string, content: string }>} [apiMessages]
 * @returns {Promise<{ text: string, metadata: Record<string, unknown> | null, images: string[] }>}
 */
export async function chat(history, newMessage, config, images = [], streamHandlers, apiMessages) {
  const textParts = [];
  const outputImages = [];
  /** @type {Record<string, unknown> | null} */
  let responseMetadata = null;
  const trimmedMessage = newMessage.trim();
  const visionQuestion = trimmedMessage || 'Describe this image in detail.';

  if (images.length > 0) {
    const visionText = await analyzeImages(images, visionQuestion, config);
    if (streamHandlers) {
      streamHandlers.onToken(visionText);
    }
    textParts.push(visionText);
  }

  if (wantsImageGeneration(trimmedMessage)) {
    const genPrompt = extractImageGenPrompt(trimmedMessage) || visionQuestion;
    const generated = await generateImage(genPrompt, config);
    outputImages.push(generated);
    const imageMsg = `Here is the generated image for: *${genPrompt}*`;
    if (streamHandlers) {
      streamHandlers.onToken(imageMsg);
    }
    textParts.push(imageMsg);
  }

  if (images.length === 0 && !wantsImageGeneration(trimmedMessage)) {
    if (streamHandlers) {
      const llmResult = await streamGenerateResponse(
        history,
        trimmedMessage,
        config,
        streamHandlers,
        apiMessages
      );
      textParts.push(llmResult.content);
      responseMetadata = llmResult.metadata;
    } else {
      const llmResult = await generateResponse(history, trimmedMessage, config);
      textParts.push(llmResult.content);
      responseMetadata = llmResult.metadata;
    }
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
    `- For **Local Llama**, ensure Ollama is running (\`ollama serve\`) and the model is pulled (\`ollama pull llama3.2\`)\n` +
    `- For **Inference Endpoints**, use your endpoint URL in settings (e.g. \`https://xxx.aws.endpoints.huggingface.cloud\`)\n` +
    `- Large models may take 1–3 minutes on cold start\n` +
    `- Ensure your HF token has access to the endpoint\n` +
    `- For public models, use Inference Providers token permission\n\n` +
    `_(Error: ${message})_`
  );
}
