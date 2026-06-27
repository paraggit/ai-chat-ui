const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * @param {unknown} images
 * @returns {string[]}
 */
export function sanitizeImages(images) {
  if (!Array.isArray(images)) return [];

  return images
    .filter((img) => typeof img === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,/.test(img))
    .slice(0, MAX_IMAGES);
}

/**
 * @param {string} message
 * @returns {boolean}
 */
export function wantsImageGeneration(message) {
  const text = message.trim();
  return (
    /^\/(image|generate|draw)\b/i.test(text) ||
    /\b(generate|create|draw|make|render)\s+(an?\s+)?(image|picture|photo|illustration|artwork)\b/i.test(text)
  );
}

/**
 * @param {string} message
 * @returns {string}
 */
export function extractImageGenPrompt(message) {
  return message
    .trim()
    .replace(/^\/(image|generate|draw)\s*/i, '')
    .replace(
      /^\s*(please\s+)?(generate|create|draw|make|render)\s+(an?\s+)?(image|picture|photo|illustration|artwork)\s+(of\s+)?/i,
      ''
    )
    .trim();
}

export { MAX_IMAGES, MAX_IMAGE_BYTES };
