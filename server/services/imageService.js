const DEFAULT_HF_API_BASE = 'https://api-inference.huggingface.co/models';
const IMAGE_GEN_TIMEOUT_MS = 120000;
const VISION_TIMEOUT_MS = 45000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

/**
 * @typedef {import('./hfService.js').HFConfig} HFConfig
 */

/**
 * @param {string} model
 * @param {HFConfig} config
 */
function buildModelUrl(model, config) {
  if (config.endpoint) {
    return config.endpoint.replace(/\/$/, '');
  }
  return `${DEFAULT_HF_API_BASE}/${model}`;
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
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {ArrayBuffer} buffer
 * @param {string} mimeType
 */
function bufferToDataUrl(buffer, mimeType) {
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Analyze uploaded image(s) with a vision model.
 * @param {string[]} images
 * @param {string} question
 * @param {HFConfig & { visionModel?: string }} config
 * @returns {Promise<string>}
 */
export async function analyzeImages(images, question, config) {
  const visionModel = config.visionModel || process.env.HF_VISION_MODEL || 'Salesforce/blip-vqa-base';
  const url = buildModelUrl(visionModel, { ...config, endpoint: '' });
  const answers = [];

  for (let i = 0; i < images.length; i += 1) {
    const image = images[i];
    const prompt = images.length > 1 ? `${question} (image ${i + 1} of ${images.length})` : question;

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
              inputs: {
                image,
                question: prompt,
              },
            }),
          },
          VISION_TIMEOUT_MS
        );

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Vision API error (${response.status}): ${errorBody}`);
        }

        const data = await response.json();
        answers.push(extractVisionAnswer(data, i + 1, images.length));
        break;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    if (answers.length <= i) {
      throw lastError ?? new Error('Vision analysis failed');
    }
  }

  return answers.join('\n\n');
}

/**
 * Generate an image from a text prompt.
 * @param {string} prompt
 * @param {HFConfig & { imageGenModel?: string }} config
 * @returns {Promise<string>} data URL
 */
export async function generateImage(prompt, config) {
  const imageGenModel =
    config.imageGenModel || process.env.HF_IMAGE_GEN_MODEL || 'stabilityai/stable-diffusion-2-1';
  const url = buildModelUrl(imageGenModel, { ...config, endpoint: '' });

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
          body: JSON.stringify({ inputs: prompt }),
        },
        IMAGE_GEN_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Image generation API error (${response.status}): ${errorBody}`);
      }

      const contentType = response.headers.get('content-type') || 'image/png';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        throw new Error(typeof data?.error === 'string' ? data.error : 'Unexpected JSON from image model');
      }

      const buffer = await response.arrayBuffer();
      const mimeType = contentType.split(';')[0].trim() || 'image/png';
      return bufferToDataUrl(buffer, mimeType);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error('Image generation failed');
}

/**
 * @param {unknown} data
 * @param {number} index
 * @param {number} total
 */
function extractVisionAnswer(data, index, total) {
  const prefix = total > 1 ? `**Image ${index}:** ` : '';

  if (Array.isArray(data)) {
    const first = data[0];
    if (typeof first?.answer === 'string') {
      return `${prefix}${first.answer.trim()}`;
    }
    if (typeof first?.generated_text === 'string') {
      return `${prefix}${first.generated_text.trim()}`;
    }
  }

  if (typeof data === 'object' && data !== null) {
    if ('answer' in data && typeof data.answer === 'string') {
      return `${prefix}${data.answer.trim()}`;
    }
    if ('generated_text' in data && typeof data.generated_text === 'string') {
      return `${prefix}${data.generated_text.trim()}`;
    }
  }

  if (typeof data === 'string') {
    return `${prefix}${data.trim()}`;
  }

  throw new Error('Unexpected vision API response format');
}
