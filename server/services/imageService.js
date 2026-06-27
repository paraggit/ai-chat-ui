import {
  buildInferenceModelUrl,
  fetchWithTimeout,
  readApiError,
  sleep,
} from './hfClient.js';

const IMAGE_GEN_TIMEOUT_MS = 120000;
const VISION_TIMEOUT_MS = 45000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

/**
 * @typedef {import('./hfService.js').HFConfig} HFConfig
 */

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
 * @param {HFConfig} config
 * @returns {Promise<string>}
 */
export async function analyzeImages(images, question, config) {
  const visionModel = config.visionModel;
  const url = buildInferenceModelUrl(visionModel, config.endpoint || undefined);
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
          await readApiError(response, 'Vision API');
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
 * @param {HFConfig} config
 * @returns {Promise<string>} data URL
 */
export async function generateImage(prompt, config) {
  const url = buildInferenceModelUrl(config.imageGenModel, config.endpoint || undefined);

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
        await readApiError(response, 'Image generation API');
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
