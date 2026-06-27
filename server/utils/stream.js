/**
 * SSE streaming utilities.
 */

/**
 * Initialize SSE headers on the response.
 * @param {import('express').Response} res
 */
export function initSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
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

/**
 * Signal stream completion.
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
