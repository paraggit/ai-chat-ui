/**
 * Heuristic detection of degenerate / gibberish model output.
 * @param {unknown} text
 * @returns {boolean}
 */
export function isLowQualityText(text) {
  if (!text || typeof text !== 'string') return false;

  const trimmed = text.trim();
  if (trimmed.length < 15) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 3 && words.every((word) => word.length <= 40)) {
    return false;
  }

  if (trimmed.length >= 20 && !/\s/.test(trimmed)) {
    return true;
  }

  const letters = trimmed.replace(/[^a-zA-Z]/g, '');
  if (letters.length >= 15) {
    const vowels = (letters.match(/[aeiouAEIOU]/g) || []).length;
    if (vowels / letters.length < 0.15) {
      return true;
    }
  }

  if (/(.)\1{5,}/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * @param {unknown} text
 * @returns {string}
 */
export function sanitizeMemoryText(text) {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (!trimmed || isLowQualityText(trimmed)) return '';
  return trimmed;
}

/**
 * @param {unknown} facts
 * @returns {string[]}
 */
export function sanitizeMemoryFacts(facts) {
  if (!Array.isArray(facts)) return [];
  return facts
    .filter((fact) => typeof fact === 'string')
    .map((fact) => fact.trim())
    .filter((fact) => fact && !isLowQualityText(fact));
}
