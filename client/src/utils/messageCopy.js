import { getReasoning } from '../components/ReasoningBlock.jsx';

/**
 * @param {{ role?: string, content?: string, metadata?: Record<string, unknown> }} message
 */
export function buildCopyText(message) {
  if (!message) return '';

  const parts = [];
  const reasoning = getReasoning(message.metadata);

  if (reasoning) {
    parts.push(`Reasoning:\n${reasoning}`);
  }

  if (message.content?.trim()) {
    parts.push(message.content.trim());
  }

  return parts.join('\n\n');
}

/**
 * @param {{ role?: string, content?: string, metadata?: Record<string, unknown> }} message
 */
export async function copyMessageText(message) {
  const text = buildCopyText(message);
  if (!text) return false;
  await navigator.clipboard.writeText(text);
  return true;
}
