/**
 * SSE streaming utilities.
 */

/**
 * Initialize SSE headers on the response.
 * @param {import('express').Response} res
 */
export function initSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  // SSE comment keeps some proxies from buffering the connection
  res.write(': connected\n\n');
  res.flush?.();
}

/**
 * Send a token chunk over SSE.
 * @param {import('express').Response} res
 * @param {string} token
 */
export function sendToken(res, token) {
  res.write(`data: ${JSON.stringify({ token })}\n\n`);
}

/**
 * Send an error event over SSE.
 * @param {import('express').Response} res
 * @param {string} message
 */
export function sendError(res, message) {
  res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
}

export function sendImage(res, image) {
  res.write(`data: ${JSON.stringify({ image })}\n\n`);
}

/**
 * Send a status update over SSE (shown while waiting for the model).
 * @param {import('express').Response} res
 * @param {string} status
 */
export function sendStatus(res, status) {
  res.write(`data: ${JSON.stringify({ status })}\n\n`);
  res.flush?.();
}

/**
 * Send the complete assistant message in one SSE event (reliable fallback for the UI).
 * @param {import('express').Response} res
 * @param {string} message
 * @param {Record<string, unknown> | null | undefined} [metadata]
 */
export function sendMessage(res, message, metadata) {
  const payload = { message };
  if (metadata && Object.keys(metadata).length > 0) {
    payload.metadata = metadata;
  }
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  res.flush?.();
}

/**
 * @param {import('express').Response} res
 */
export function sendDone(res) {
  res.write('data: [DONE]\n\n');
  res.end();
}

/**
 * Simulate streaming by chunking text with a small delay.
 * @param {import('express').Response} res
 * @param {string} text
 * @param {number} [chunkSize=4]
 * @param {number} [delayMs=20]
 */
export async function simulateStream(res, text, chunkSize = 4, delayMs = 20) {
  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.slice(i, i + chunkSize);
    sendToken(res, chunk);
    await sleep(delayMs);
  }
}

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
