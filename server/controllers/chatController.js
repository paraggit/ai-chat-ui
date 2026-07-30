import { sessionStore } from '../services/sessionStore.js';
import { chat, getFallbackResponse, resolveHFConfig } from '../services/hfService.js';
import { prepareConversationContext } from '../services/contextManager.js';
import { sanitizeImages, wantsImageGeneration } from '../utils/images.js';
import { isLowQualityText } from '../utils/textQuality.js';
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
    systemPrompt,
    temperature,
    topP,
    frequencyPenalty,
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
      maxTokens:
        maxTokens !== undefined && maxTokens !== null && maxTokens !== ''
          ? Number(maxTokens)
          : undefined,
      temperature: typeof temperature === 'number' ? temperature : undefined,
      topP: typeof topP === 'number' ? topP : undefined,
      frequencyPenalty: typeof frequencyPenalty === 'number' ? frequencyPenalty : undefined,
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

  if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
    const existing = sessionStore.getSystemPrompt(sessionId);
    if (!existing) {
      sessionStore.setSystemPrompt(sessionId, systemPrompt.trim());
    }
  }

  const fullHistory = sessionStore.getHistory(sessionId);
  const useContextMemory =
    sanitizedImages.length === 0 && !wantsImageGeneration(trimmedMessage);

  initSSE(res);
  sendStatus(res, useContextMemory ? 'Preparing context…' : 'Connecting…');

  const sessionSystemPrompt = sessionStore.getSystemPrompt(sessionId) || (typeof systemPrompt === 'string' ? systemPrompt.trim() : '');

  /** @type {Awaited<ReturnType<typeof prepareConversationContext>> | null} */
  let contextInfo = null;
  if (useContextMemory) {
    try {
      contextInfo = await prepareConversationContext(sessionId, fullHistory, hfConfig, sessionSystemPrompt || undefined);
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
      outputTokenLimit: hfConfig.maxTokens,
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

    if (isLowQualityText(fullResponse)) {
      console.warn('[chatController] Degenerate model output detected');
      if (contextInfo?.memoryUsed) {
        sessionStore.clearMemory(sessionId);
      }

      if (!res.writableEnded) {
        sendStatus(res, 'Retrying with a clean context…');
      }

      try {
        const retry = await chat(history, trimmedMessage, hfConfig, sanitizedImages);
        if (retry.text && !isLowQualityText(retry.text)) {
          fullResponse = retry.text;
          responseMetadata = {
            ...(retry.metadata ?? {}),
            outputTokenLimit: hfConfig.maxTokens,
            retriedWithoutMemory: Boolean(contextInfo?.memoryUsed),
          };
          if (!res.writableEnded) {
            sendFullMessage(res, fullResponse, responseMetadata);
          }
        } else {
          fullResponse =
            'The model returned unusable output. Try starting a new chat, lowering temperature, or switching models.';
          responseMetadata = {
            ...(responseMetadata ?? {}),
            lowQuality: true,
          };
          if (!res.writableEnded) {
            sendFullMessage(res, fullResponse, responseMetadata);
          }
        }
      } catch (retryError) {
        console.warn('[chatController] Retry after low-quality output failed:', retryError.message);
      }
    }

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
  const systemPrompt = sessionStore.getSystemPrompt(sessionId);
  const sessions = sessionStore.listSessions();
  const meta = sessions.find((s) => s.id === sessionId);

  res.json({
    sessionId,
    title: meta?.title ?? 'New chat',
    history,
    memory,
    systemPrompt,
  });
}

/**
 * List saved chat sessions.
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 */
export function listSessions(_req, res) {
  res.json({ sessions: sessionStore.listSessions() });
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

/**
 * Edit a user message and regenerate from that point.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function editMessage(req, res) {
  const { sessionId, messageIndex, newContent } = req.body ?? {};

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  if (typeof messageIndex !== 'number' || messageIndex < 0) {
    return res.status(400).json({ error: 'messageIndex is required' });
  }
  const trimmed = typeof newContent === 'string' ? newContent.trim() : '';
  if (!trimmed) {
    return res.status(400).json({ error: 'newContent is required' });
  }

  const history = sessionStore.getHistory(sessionId);
  if (messageIndex >= history.length) {
    return res.status(400).json({ error: 'messageIndex out of range' });
  }

  sessionStore.truncateAt(sessionId, messageIndex);

  req.body = { ...req.body, message: trimmed };
  return streamChat(req, res);
}

/**
 * Regenerate the last assistant response.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function regenerateLastResponse(req, res) {
  const { sessionId } = req.body ?? {};

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  const history = sessionStore.getHistory(sessionId);
  if (history.length < 2) {
    return res.status(400).json({ error: 'Not enough history to regenerate' });
  }

  const lastAssistantIndex = history.length - 1;
  if (history[lastAssistantIndex]?.role !== 'assistant') {
    return res.status(400).json({ error: 'Last message is not an assistant response' });
  }

  const lastUserMsg = history[lastAssistantIndex - 1];
  if (lastUserMsg?.role !== 'user') {
    return res.status(400).json({ error: 'Could not find the user message to regenerate from' });
  }

  sessionStore.truncateAt(sessionId, lastAssistantIndex);

  req.body = { ...req.body, message: lastUserMsg.content || '' };
  return streamChat(req, res);
}

/**
 * Import a conversation from JSON.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function importSession(req, res) {
  const data = req.body;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Invalid import data' });
  }

  try {
    const sessionId = sessionStore.importSession(data);
    res.json({ success: true, sessionId });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Import failed' });
  }
}

/**
 * Compare responses from two models side-by-side.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function compareChat(req, res) {
  const {
    message, sessionId, model2, provider, hfToken, model, endpoint,
    visionModel, imageGenModel, maxTokens, systemPrompt,
    temperature, topP, frequencyPenalty,
  } = req.body ?? {};

  const trimmed = typeof message === 'string' ? message.trim() : '';
  if (!trimmed) return res.status(400).json({ error: 'message is required' });
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
  if (!model2 || typeof model2 !== 'string') return res.status(400).json({ error: 'model2 is required' });

  let config1, config2;
  try {
    const base = {
      provider: typeof provider === 'string' ? provider.trim() : undefined,
      token: typeof hfToken === 'string' ? hfToken.trim() : undefined,
      endpoint: typeof endpoint === 'string' ? endpoint.trim() : undefined,
      visionModel: typeof visionModel === 'string' ? visionModel.trim() : undefined,
      imageGenModel: typeof imageGenModel === 'string' ? imageGenModel.trim() : undefined,
      maxTokens: maxTokens !== undefined ? Number(maxTokens) : undefined,
      temperature: typeof temperature === 'number' ? temperature : undefined,
      topP: typeof topP === 'number' ? topP : undefined,
      frequencyPenalty: typeof frequencyPenalty === 'number' ? frequencyPenalty : undefined,
    };
    config1 = resolveHFConfig({ ...base, model: typeof model === 'string' ? model.trim() : undefined });
    config2 = resolveHFConfig({ ...base, model: model2.trim() });

    if (config1.model === config2.model) {
      return res.status(400).json({ error: 'model2 must be different from the primary model' });
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  sessionStore.appendMessage(sessionId, { role: 'user', content: trimmed });
  const fullHistory = sessionStore.getHistory(sessionId);
  const history = fullHistory.slice(0, -1);

  const sessionSystemPrompt = sessionStore.getSystemPrompt(sessionId) || (typeof systemPrompt === 'string' ? systemPrompt.trim() : '');

  if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
    const existing = sessionStore.getSystemPrompt(sessionId);
    if (!existing) {
      sessionStore.setSystemPrompt(sessionId, systemPrompt.trim());
    }
  }

  initSSE(res);
  sendStatus(res, 'Comparing models…');

  const sendModelToken = (modelLabel, token) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ model: modelLabel, token })}\n\n`);
      res.flush?.();
    }
  };

  const responses = { model1: '', model2: '', error1: null, error2: null };

  let contextInfo1 = null;
  let contextInfo2 = null;
  try {
    contextInfo1 = await prepareConversationContext(sessionId, fullHistory, config1, sessionSystemPrompt || undefined);
    contextInfo2 = await prepareConversationContext(sessionId, fullHistory, config2, sessionSystemPrompt || undefined);
  } catch (error) {
    console.warn('[compareChat] Context preparation failed:', error.message);
  }

  try {
    const results = await Promise.allSettled([
      chat(history, trimmed, config1, [], {
        onToken: (t) => { responses.model1 += t; sendModelToken(config1.model, t); },
      }, contextInfo1?.messages).then((r) => { responses.model1 = r.text || responses.model1; }),
      chat(history, trimmed, config2, [], {
        onToken: (t) => { responses.model2 += t; sendModelToken(config2.model, t); },
      }, contextInfo2?.messages).then((r) => { responses.model2 = r.text || responses.model2; }),
    ]);

    if (results[0].status === 'rejected') {
      responses.error1 = results[0].reason?.message || 'Model 1 failed';
    }
    if (results[1].status === 'rejected') {
      responses.error2 = results[1].reason?.message || 'Model 2 failed';
    }

    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({
        compare: true,
        responses: [
          { model: config1.model, content: responses.model1, error: responses.error1 },
          { model: config2.model, content: responses.model2, error: responses.error2 },
        ],
      })}\n\n`);
    }

    sendDone(res);
  } catch (error) {
    if (!res.writableEnded) {
      sendError(res, error.message);
      sendDone(res);
    }
  }
}

/**
 * Store a chosen response from a compare operation.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function keepResponse(req, res) {
  const { sessionId, content } = req.body ?? {};
  if (!sessionId || typeof content !== 'string') {
    return res.status(400).json({ error: 'sessionId and content required' });
  }
  sessionStore.appendMessage(sessionId, { role: 'assistant', content });
  res.json({ success: true });
}
