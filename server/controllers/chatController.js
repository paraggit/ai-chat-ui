import { sessionStore } from '../services/sessionStore.js';
import { chat, getFallbackResponse, resolveHFConfig } from '../services/hfService.js';
import { prepareConversationContext } from '../services/contextManager.js';
import { sanitizeImages, wantsImageGeneration } from '../utils/images.js';
import { initSSE, sendError, sendDone, sendImage, sendMessage as sendFullMessage, sendMetadata, sendStatus, sendToken, simulateStream } from '../utils/stream.js';

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
    provider,
    hfToken,
    model,
    endpoint,
    visionModel,
    imageGenModel,
    maxTokens,
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
      provider: typeof provider === 'string' ? provider.trim() : undefined,
      token: typeof hfToken === 'string' ? hfToken.trim() : undefined,
      model: typeof model === 'string' ? model.trim() : undefined,
      endpoint: typeof endpoint === 'string' ? endpoint.trim() : undefined,
      visionModel: typeof visionModel === 'string' ? visionModel.trim() : undefined,
      imageGenModel: typeof imageGenModel === 'string' ? imageGenModel.trim() : undefined,
      maxTokens,
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

  const fullHistory = sessionStore.getHistory(sessionId);
  const useContextMemory =
    sanitizedImages.length === 0 && !wantsImageGeneration(trimmedMessage);

  initSSE(res);
  sendStatus(res, useContextMemory ? 'Preparing context…' : 'Connecting…');

  /** @type {Awaited<ReturnType<typeof prepareConversationContext>> | null} */
  let contextInfo = null;
  if (useContextMemory) {
    try {
      contextInfo = await prepareConversationContext(sessionId, fullHistory, hfConfig);
      if (contextInfo.summarized) {
        sendStatus(res, 'Conversation memory updated…');
      }
    } catch (error) {
      console.warn('[chatController] Context preparation failed:', error.message);
    }
  }

  sendStatus(
    res,
    hfConfig.provider === 'local'
      ? 'Connecting to local Llama…'
      : hfConfig.endpoint
        ? 'Connecting to your inference endpoint…'
        : 'Generating response…'
  );

  req.on('aborted', () => {
    console.warn('[chatController] Client disconnected during request');
  });

  let fullResponse = '';
  let responseMetadata = null;
  let responseImages = [];
  let streamedToClient = false;

  try {
    const result = await chat(
      history,
      trimmedMessage,
      hfConfig,
      sanitizedImages,
      {
        onToken: (token) => {
          if (res.writableEnded) return;
          streamedToClient = true;
          fullResponse += token;
          sendToken(res, token);
        },
        onMetadata: (metadata) => {
          responseMetadata = metadata;
          if (!res.writableEnded) {
            sendMetadata(res, metadata);
          }
        },
      },
      contextInfo?.messages
    );

    fullResponse = result.text || fullResponse || 'Done.';
    responseMetadata = {
      ...(result.metadata ?? responseMetadata ?? {}),
      ...(contextInfo
        ? {
            context: {
              tokenEstimate: contextInfo.tokenEstimate,
              maxContextTokens: contextInfo.maxContextTokens,
              recentMessageCount: contextInfo.recentMessageCount,
              totalMessageCount: contextInfo.totalMessageCount,
              trimmedMessages: contextInfo.trimmedMessages,
              memoryUsed: contextInfo.memoryUsed,
              summarized: contextInfo.summarized,
            },
          }
        : {}),
    };
    responseImages = result.images;

    if (res.writableEnded) {
      console.warn('[chatController] Response already closed before streaming');
      sessionStore.appendMessage(sessionId, {
        role: 'assistant',
        content: fullResponse,
        metadata: responseMetadata ?? undefined,
        images: responseImages.length > 0 ? responseImages : undefined,
      });
      return;
    }

    if (!streamedToClient && fullResponse) {
      console.log(`[chatController] Simulating stream for ${fullResponse.length} chars`);
      sendStatus(res, 'Streaming reply…');
      await simulateStream(res, fullResponse);
    }

    for (const image of responseImages) {
      sendImage(res, image);
    }

    sessionStore.appendMessage(sessionId, {
      role: 'assistant',
      content: fullResponse,
      metadata: responseMetadata ?? undefined,
      images: responseImages.length > 0 ? responseImages : undefined,
    });
    sendDone(res);
  } catch (error) {
    if (res.writableEnded) {
      console.warn('[chatController] Response closed during error handling');
      return;
    }

    console.error('[chatController] HF error:', error.message);
    fullResponse = getFallbackResponse(error);
    sendStatus(res, 'Request failed');
    sendFullMessage(res, fullResponse);
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
  const memory = sessionStore.getMemory(sessionId);
  res.json({ sessionId, history, memory });
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
