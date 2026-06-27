const SYSTEM_PROMPT = 'You are a helpful AI assistant.';

/**
 * Build OpenAI-style messages for the HF router chat completions API.
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} newMessage
 * @returns {Array<{ role: string, content: string }>}
 */
export function buildChatMessages(history, newMessage) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

  for (const msg of history) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({
        role: msg.role,
        content: msg.content || '',
      });
    }
  }

  messages.push({ role: 'user', content: newMessage });
  return messages;
}

/**
 * Build a structured prompt from conversation history and the latest user message.
 * Kept for compatibility with non-chat inference paths.
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} newMessage
 * @returns {string}
 */
export function buildPrompt(history, newMessage) {
  const historyLines = history
    .map((m) => `${capitalizeRole(m.role)}: ${m.content}`)
    .join('\n');

  return `System: ${SYSTEM_PROMPT}
${historyLines ? `${historyLines}\n` : ''}User: ${newMessage}
Assistant:`;
}

/**
 * @param {string} role
 */
function capitalizeRole(role) {
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Assistant';
  if (role === 'system') return 'System';
  return role.charAt(0).toUpperCase() + role.slice(1);
}
