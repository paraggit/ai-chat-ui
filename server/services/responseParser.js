/**
 * Preserve exact streamed token text — do not trim (leading spaces are word boundaries).
 * @param {unknown} content
 * @returns {string}
 */
export function normalizeStreamDelta(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (part?.type === 'text' && typeof part?.text === 'string') return part.text;
        return '';
      })
      .join('');
  }

  return '';
}

/**
 * Normalize complete message content (safe to trim once the full reply is assembled).
 * @param {unknown} content
 * @returns {string}
 */
export function normalizeContent(content) {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (part?.type === 'text' && typeof part?.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join('')
      .trim();
  }

  return '';
}

/**
 * @param {string} text
 */
function stripThinkingTags(text) {
  const thinkingBlocks = [];
  const thinkBlock = /<\s*think\s*>([\s\S]*?)<\s*\/\s*think\s*>/gi;
  const stripped = text
    .replace(thinkBlock, (_, inner) => {
      if (inner.trim()) thinkingBlocks.push(inner.trim());
      return '';
    })
    .trim();

  return { stripped, thinkingBlocks };
}

/**
 * @typedef {Object} ParsedModelResponse
 * @property {string} content
 * @property {Record<string, unknown> | null} metadata
 */

/**
 * Split visible assistant reply from model metadata (reasoning, usage, etc.).
 * @param {unknown} data
 * @param {{ strategy?: string }} [context]
 * @returns {ParsedModelResponse}
 */
export function parseModelResponse(data, context = {}) {
  /** @type {Record<string, unknown>} */
  const metadata = {};

  if (context.strategy) {
    metadata.strategy = context.strategy;
  }

  let content = '';

  if (typeof data === 'object' && data !== null) {
    const choice = data.choices?.[0];
    const message = choice?.message;

    if (typeof data.model === 'string') metadata.model = data.model;
    if (typeof data.id === 'string') metadata.id = data.id;
    if (typeof data.system_fingerprint === 'string') {
      metadata.systemFingerprint = data.system_fingerprint;
    }
    if (choice?.finish_reason) metadata.finishReason = choice.finish_reason;
    if (data.usage && typeof data.usage === 'object') metadata.usage = data.usage;

    if (message && typeof message === 'object') {
      content = normalizeContent(message.content);

      const reasoning = [
        normalizeContent(message.reasoning_content),
        normalizeContent(message.reasoning),
      ]
        .filter(Boolean)
        .join('\n\n');

      if (reasoning) metadata.reasoning = reasoning;

      if (message.tool_calls?.length) {
        metadata.toolCalls = message.tool_calls;
      }
    }

    if (!content && typeof choice?.text === 'string') {
      content = choice.text.trim();
    }
    if (!content && typeof data.generated_text === 'string') {
      content = data.generated_text.trim();
    }
    if (!content && typeof data.output === 'string') {
      content = data.output.trim();
    }
    if (!content && typeof data.text === 'string') {
      content = data.text.trim();
    }

    if ('error' in data && typeof data.error === 'object' && data.error?.message) {
      throw new Error(data.error.message);
    }
  }

  if (!content && Array.isArray(data)) {
    const first = data[0];
    if (typeof first?.generated_text === 'string') {
      content = first.generated_text.trim();
    } else if (typeof first?.summary_text === 'string') {
      content = first.summary_text.trim();
    }
  }

  if (!content && typeof data === 'string') {
    content = data.trim();
  }

  const { stripped, thinkingBlocks } = stripThinkingTags(content);
  content = stripped;

  if (thinkingBlocks.length) {
    const existing = typeof metadata.reasoning === 'string' ? metadata.reasoning : '';
    metadata.reasoning = [existing, ...thinkingBlocks].filter(Boolean).join('\n\n');
  }

  if (!content && !Object.keys(metadata).length) {
    throw new Error(`Unexpected response format: ${JSON.stringify(data).slice(0, 500)}`);
  }

  const hasMetadata = Object.keys(metadata).length > 0;
  return {
    content: content || '',
    metadata: hasMetadata ? metadata : null,
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} metadata
 */
export function hasDisplayableMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return false;
  return Object.keys(metadata).length > 0;
}
