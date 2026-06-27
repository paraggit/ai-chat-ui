import { sessionStore } from '../services/sessionStore.js';
import { chat, getFallbackResponse, resolveHFConfig } from '../services/hfService.js';
import { initSSE, sendError, sendDone, simulateStream } from '../utils/stream.js';

/**
 * Handle streaming chat via SSE.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function streamChat(req, res) {
  const { message, sessionId, hfToken, model, endpoint } = req.body ?? {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  let hfConfig;
  try {
    hfConfig = resolveHFConfig({
      token: typeof hfToken === 'string' ? hfToken.trim() : undefined,
      model: typeof model === 'string' ? model.trim() : undefined,
      endpoint: typeof endpoint === 'string' ? endpoint.trim() : undefined,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const trimmedMessage = message.trim();
  const history = sessionStore.getHistory(sessionId);

  sessionStore.appendMessage(sessionId, { role: 'user', content: trimmedMessage });

  initSSE(res);

  req.on('close', () => {
    if (!res.writableEnded) {
      res.end();
    }
  });

  let fullResponse = '';

  try {
    fullResponse = await chat(history, trimmedMessage, hfConfig);
    await simulateStream(res, fullResponse);
    sessionStore.appendMessage(sessionId, { role: 'assistant', content: fullResponse });
    sendDone(res);
  } catch (error) {
    console.error('[chatController] HF error:', error.message);
    fullResponse = getFallbackResponse(error);
    await simulateStream(res, fullResponse);
    sessionStore.appendMessage(sessionId, { role: 'assistant', content: fullResponse });
    sendError(res, error.message);
    sendDone(res);
  }
}

/**
 * Get conversation history for a session.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function getHistory(req, res) {
  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  const history = sessionStore.getHistory(sessionId);
  res.json({ sessionId, history });
}

/**
 * Clear a session's conversation history.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function clearHistory(req, res) {
  const { sessionId } = req.body ?? {};

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  sessionStore.clearSession(sessionId);
  res.json({ success: true, sessionId });
}

/**
 * Health check endpoint.
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 */
export function healthCheck(_req, res) {
  res.json({
    status: 'ok',
    service: 'HF Chat Pro',
    model: process.env.HF_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2',
    timestamp: new Date().toISOString(),
  });
}
