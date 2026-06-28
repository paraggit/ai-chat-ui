const SYSTEM_PROMPT = 'You are a helpful AI assistant.';

/**
 * @param {{ conversationSummary?: string, longTermMemory?: string[] }} [memory]
 */
export function buildSystemPrompt(memory = {}) {
  const parts = [SYSTEM_PROMPT];

  if (memory.longTermMemory?.length) {
    parts.push(
      'Long-term user memory:\n' +
        memory.longTermMemory.map((fact) => `- ${fact}`).join('\n')
    );
  }

  if (memory.conversationSummary?.trim()) {
    parts.push(`Earlier conversation summary:\n${memory.conversationSummary.trim()}`);
  }

  return parts.join('\n\n');
}

/**
 * Build OpenAI-style messages for the model (history should already include the latest user turn).
 * @param {Array<{ role: string, content: string }>} recentHistory
 * @param {{ conversationSummary?: string, longTermMemory?: string[] }} [memory]
 * @returns {Array<{ role: string, content: string }>}
 */
export function buildModelMessages(recentHistory, memory = {}) {
  const messages = [{ role: 'system', content: buildSystemPrompt(memory) }];

  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({
        role: msg.role,
        content: msg.content || '',
      });
    }
  }

  return messages;
}

/**
 * Build OpenAI-style messages for the HF router chat completions API.
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} newMessage
 * @param {{ conversationSummary?: string, longTermMemory?: string[] }} [memory]
 * @returns {Array<{ role: string, content: string }>}
 */
export function buildChatMessages(history, newMessage, memory = {}) {
  const recent = [...history];
  if (newMessage) {
    recent.push({ role: 'user', content: newMessage });
  }
  return buildModelMessages(recent, memory);
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
