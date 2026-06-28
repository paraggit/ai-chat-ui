/**
 * Rough token estimate (~4 chars per token for English-ish text).
 * Good enough for context budgeting without extra dependencies.
 * @param {string} text
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * @param {Array<{ role?: string, content?: string }>} messages
 */
export function estimateMessagesTokens(messages) {
  let total = 0;
  for (const message of messages) {
    total += 4; // role / formatting overhead
    total += estimateTokens(message.content ?? '');
  }
  return total;
}

/**
 * Truncate text to approximately maxTokens.
 * @param {string} text
 * @param {number} maxTokens
 */
export function truncateToTokenBudget(text, maxTokens) {
  if (!text || maxTokens <= 0) return '';
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}…`;
}
