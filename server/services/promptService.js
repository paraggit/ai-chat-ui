const SYSTEM_PROMPT = 'You are a helpful AI assistant.';

/**
 * Build a structured prompt from conversation history and the latest user message.
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
