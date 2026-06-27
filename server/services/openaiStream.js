import { normalizeContent } from './responseParser.js';
import { fetchWithTimeout, readApiError } from './hfClient.js';

/**
 * @typedef {Object} StreamHandlers
 * @property {(token: string) => void} onToken
 * @property {(metadata: Record<string, unknown>) => void} [onMetadata]
 */

/**
 * Read an OpenAI-compatible SSE stream and invoke handlers per delta.
 * @param {Response} response
 * @param {StreamHandlers} handlers
 * @param {{ strategy?: string }} [context]
 * @returns {Promise<{ content: string, metadata: Record<string, unknown> | null }>}
 */
export async function consumeOpenAiStream(response, handlers, context = {}) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Streaming response has no body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoning = '';
  /** @type {Record<string, unknown>} */
  const metadata = {};

  if (context.strategy) {
    metadata.strategy = context.strategy;
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;

      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      let chunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }

      if (chunk?.error?.message) {
        throw new Error(chunk.error.message);
      }

      if (typeof chunk.model === 'string') metadata.model = chunk.model;
      if (typeof chunk.id === 'string') metadata.id = chunk.id;
      if (chunk.usage && typeof chunk.usage === 'object') metadata.usage = chunk.usage;

      const choice = chunk.choices?.[0];
      if (choice?.finish_reason) metadata.finishReason = choice.finish_reason;

      const delta = choice?.delta;
      if (!delta || typeof delta !== 'object') continue;

      const contentDelta = normalizeContent(delta.content);
      const reasoningDelta = [normalizeContent(delta.reasoning_content), normalizeContent(delta.reasoning)]
        .filter(Boolean)
        .join('');

      if (reasoningDelta) {
        reasoning += reasoningDelta;
      }

      if (contentDelta) {
        content += contentDelta;
        handlers.onToken(contentDelta);
      }
    }
  }

  if (reasoning.trim()) {
    metadata.reasoning = reasoning.trim();
  }

  const finalMetadata = Object.keys(metadata).length > 0 ? metadata : null;
  if (finalMetadata && handlers.onMetadata) {
    handlers.onMetadata(finalMetadata);
  }

  return { content, metadata: finalMetadata };
}

/**
 * POST to an OpenAI-compatible chat completions endpoint with streaming enabled.
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {object} body
 * @param {StreamHandlers} handlers
 * @param {{ strategy?: string, label?: string, timeoutMs?: number }} [context]
 */
export async function streamOpenAiChatCompletions(url, headers, body, handlers, context = {}) {
  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        ...headers,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        ...body,
        stream: true,
      }),
    },
    context.timeoutMs ?? 120000
  );

  if (!response.ok) {
    await readApiError(response, context.label || 'Chat API');
  }

  return consumeOpenAiStream(response, handlers, context);
}
