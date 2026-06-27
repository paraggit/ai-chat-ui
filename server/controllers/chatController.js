import { sessionStore } from '../services/sessionStore.js';
import { chat, getFallbackResponse, resolveHFConfig } from '../services/hfService.js';
import { sanitizeImages } from '../utils/images.js';
import { initSSE, sendError, sendDone, sendImage, simulateStream } from '../utils/stream.js';

/**
 * Handle streaming chat via SSE.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function streamChat(req, res) {
  const {
    message,
    sessionId,
    images,
    hfToken,
    model,
    endpoint,
    visionModel,
    imageGenModel,
  } = req.body ?? {};

  const sanitizedImages = sanitizeImages(images);
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';

  if (!trimmedMessage && sanitizedImages.length === 0) {
    return res.status(400).json({ error: 'message or images required' });
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
      visionModel: typeof visionModel === 'string' ? visionModel.trim() : undefined,
      imageGenModel: typeof imageGenModel === 'string' ? imageGenModel.trim() : undefined,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const history = sessionStore.getHistory(sessionId);

  sessionStore.appendMessage(sessionId, {
    role: 'user',
    content: trimmedMessage,
    images: sanitizedImages.length > 0 ? sanitizedImages : undefined,
  });

  initSSE(res);

  req.on('close', () => {
    if (!res.writableEnded) {
      res.end();
    }
  });

  let fullResponse = '';
  let responseImages = [];

  try {
    const result = await chat(history, trimmedMessage, hfConfig, sanitizedImages);
    fullResponse = result.text;
    responseImages = result.images;

    await simulateStream(res, fullResponse);

    for (const image of responseImages) {
      sendImage(res, image);
    }

    sessionStore.appendMessage(sessionId, {
      role: 'assistant',
      content: fullResponse,
      images: responseImages.length > 0 ? responseImages : undefined,
    });
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
    model: process.env.HF_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
    visionModel: process.env.HF_VISION_MODEL || 'Salesforce/blip-vqa-base',
    imageGenModel: process.env.HF_IMAGE_GEN_MODEL || 'stabilityai/stable-diffusion-2-1',
    timestamp: new Date().toISOString(),
  });
}
