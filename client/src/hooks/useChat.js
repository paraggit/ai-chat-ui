import { useCallback, useEffect, useRef, useState } from 'react';
import { getSessionId, resetSessionId, setSessionId as persistSessionId } from '../utils/session.js';
import { toApiPayload } from '../utils/modelSettings.js';
import { apiUrl } from '../utils/api.js';
import { copyMessageText } from '../utils/messageCopy.js';

/**
 * @typedef {{
 *   id: string,
 *   role: 'user' | 'assistant',
 *   content: string,
 *   images?: string[],
 *   streaming?: boolean,
 *   status?: string,
 *   metadata?: Record<string, unknown>,
 * }} Message
 */

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   createdAt: string,
 *   updatedAt: string,
 *   messageCount: number,
 * }} ChatSession
 */

/**
 * @param {import('../utils/modelSettings.js').loadModelSettings extends () => infer R ? R : never} modelSettings
 * @param {string} systemPrompt
 * @param {(prompt: string) => void} [onSystemPromptLoad]
 */
export function useChat(modelSettings, systemPrompt, onSystemPromptLoad) {
  const [messages, setMessages] = useState(/** @type {Message[]} */ ([]));
  const [sessions, setSessions] = useState(/** @type {ChatSession[]} */ ([]));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [sessionId, setSessionIdState] = useState(getSessionId);
  const abortRef = useRef(/** @type {AbortController | null} */ (null));
  const isSendingRef = useRef(false);
  const stoppedByUserRef = useRef(false);
  const activeAssistantIdRef = useRef(/** @type {string | null} */ (null));

  const mapHistory = useCallback(
    (sid, history) =>
      (history ?? []).map((m, i) => ({
        id: `${sid}-${i}`,
        role: m.role,
        content: m.content ?? '',
        images: m.images,
        metadata: m.metadata,
      })),
    []
  );

  const loadSessionList = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/sessions'));
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {
      // Server may be down — ignore
    }
  }, []);

  const loadHistory = useCallback(
    async (sid) => {
      if (isSendingRef.current) return;
      try {
        const res = await fetch(apiUrl(`/api/chat/${sid}`));
        if (!res.ok) return;
        const data = await res.json();
        setMessages(mapHistory(sid, data.history));
        if (data.systemPrompt && onSystemPromptLoad) {
          onSystemPromptLoad(data.systemPrompt);
        }
      } catch {
        // Server may be down on first load — ignore
      }
    },
    [mapHistory, onSystemPromptLoad]
  );

  useEffect(() => {
    loadSessionList();
  }, [loadSessionList]);

  useEffect(() => {
    loadHistory(sessionId);
  }, [sessionId, loadHistory]);

  const selectSession = useCallback(
    (id) => {
      if (id === sessionId || isLoading) return;
      abortRef.current?.abort();
      persistSessionId(id);
      setSessionIdState(id);
      setError(null);
    },
    [sessionId, isLoading]
  );

  const sendMessage = useCallback(
    async (text, images = []) => {
      const trimmed = text.trim();
      if ((!trimmed && images.length === 0) || isLoading) return;

      setError(null);
      setIsLoading(true);
      isSendingRef.current = true;

      const userMsg = /** @type {Message} */ ({
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        images: images.length > 0 ? images : undefined,
      });

      const assistantMsg = /** @type {Message} */ ({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        images: [],
        streaming: true,
        status: 'Sending…',
      });

      activeAssistantIdRef.current = assistantMsg.id;
      stoppedByUserRef.current = false;

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(apiUrl('/api/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            sessionId,
            images,
            systemPrompt,
            ...toApiPayload(modelSettings),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Request failed (${res.status})`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();

            if (payload === '[DONE]') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, streaming: false } : m
                )
              );
              continue;
            }

            try {
              const parsed = JSON.parse(payload);
              if (parsed.status) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id ? { ...m, status: parsed.status } : m
                  )
                );
              }
              if (parsed.message) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? {
                          ...m,
                          content: parsed.message,
                          metadata: parsed.metadata ?? m.metadata,
                          status: undefined,
                        }
                      : m
                  )
                );
              }
              if (parsed.metadata && !parsed.message) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? {
                          ...m,
                          metadata: { ...(m.metadata ?? {}), ...parsed.metadata },
                        }
                      : m
                  )
                );
              }
              if (parsed.token) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: m.content + parsed.token, status: undefined }
                      : m
                  )
                );
              }
              if (parsed.image) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, images: [...(m.images ?? []), parsed.image] }
                      : m
                  )
                );
              }
              if (parsed.error) {
                setError(parsed.error);
              }
            } catch {
              // Ignore malformed SSE lines
            }
          }
        }

        await loadSessionList();
        isSendingRef.current = false;
        await loadHistory(sessionId);
      } catch (err) {
        if (err.name === 'AbortError') {
          if (stoppedByUserRef.current) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? {
                      ...m,
                      streaming: false,
                      status: undefined,
                      metadata: { ...(m.metadata ?? {}), stopped: true },
                    }
                  : m
              )
            );
          }
          stoppedByUserRef.current = false;
          return;
        }
        const message = err.message || 'Failed to send message';
        setError(message);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  content: `Sorry, something went wrong: ${message}`,
                  streaming: false,
                }
              : m
          )
        );
      } finally {
        isSendingRef.current = false;
        activeAssistantIdRef.current = null;
        setIsLoading(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id && m.streaming
              ? { ...m, streaming: false, status: undefined }
              : m
          )
        );
      }
    },
    [isLoading, sessionId, modelSettings, systemPrompt, loadSessionList, loadHistory]
  );

  const newChat = useCallback(async () => {
    abortRef.current?.abort();
    const newSessionId = resetSessionId();
    setSessionIdState(newSessionId);
    setMessages([]);
    setError(null);
    await loadSessionList();
  }, [loadSessionList]);

  const deleteSession = useCallback(
    async (targetId) => {
      if (isLoading) return;

      try {
        await fetch(apiUrl('/api/chat'), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: targetId }),
        });
      } catch {
        // Non-critical
      }

      if (targetId === sessionId) {
        const newSessionId = resetSessionId();
        setSessionIdState(newSessionId);
        setMessages([]);
        setError(null);
      }

      await loadSessionList();
    },
    [sessionId, isLoading, loadSessionList]
  );

  const stopGeneration = useCallback(() => {
    if (!isLoading) return;
    stoppedByUserRef.current = true;
    abortRef.current?.abort();
  }, [isLoading]);

  const copyLastAssistant = useCallback(async () => {
    const target = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!target) return false;
    return copyMessageText(target);
  }, [messages]);

  const editMessage = useCallback(
    async (messageIndex, newContent) => {
      if (isLoading) return;
      const trimmed = newContent.trim();
      if (!trimmed) return;

      setError(null);
      setIsLoading(true);
      isSendingRef.current = true;

      // Truncate local messages and add the edited user message
      setMessages((prev) => {
        const kept = prev.slice(0, messageIndex);
        return [
          ...kept,
          { id: crypto.randomUUID(), role: 'user', content: trimmed },
          { id: crypto.randomUUID(), role: 'assistant', content: '', streaming: true, status: 'Editing…' },
        ];
      });

      const assistantId = crypto.randomUUID();
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        return prev.map((m) => (m === last ? { ...m, id: assistantId } : m));
      });
      activeAssistantIdRef.current = assistantId;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(apiUrl('/api/chat/edit'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            messageIndex,
            newContent: trimmed,
            systemPrompt,
            ...toApiPayload(modelSettings),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Edit failed (${res.status})`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
              );
              continue;
            }
            try {
              const parsed = JSON.parse(payload);
              if (parsed.token) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + parsed.token, status: undefined }
                      : m
                  )
                );
              }
              if (parsed.message) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: parsed.message, metadata: parsed.metadata ?? m.metadata, status: undefined }
                      : m
                  )
                );
              }
              if (parsed.status) {
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, status: parsed.status } : m))
                );
              }
            } catch { /* ignore malformed */ }
          }
        }

        await loadSessionList();
        isSendingRef.current = false;
        await loadHistory(sessionId);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Edit failed');
      } finally {
        isSendingRef.current = false;
        activeAssistantIdRef.current = null;
        setIsLoading(false);
      }
    },
    [isLoading, sessionId, modelSettings, systemPrompt, loadSessionList, loadHistory]
  );

  const regenerateLastResponse = useCallback(async () => {
    if (isLoading) return;

    setError(null);
    setIsLoading(true);
    isSendingRef.current = true;

    // Remove last assistant message and add a new streaming placeholder
    const assistantId = crypto.randomUUID();
    activeAssistantIdRef.current = assistantId;

    setMessages((prev) => {
      const withoutLast = prev.slice(0, -1);
      return [
        ...withoutLast,
        { id: assistantId, role: 'assistant', content: '', streaming: true, status: 'Regenerating…' },
      ];
    });

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(apiUrl('/api/chat/regenerate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          systemPrompt,
          ...toApiPayload(modelSettings),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Regenerate failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
            );
            continue;
          }
          try {
            const parsed = JSON.parse(payload);
            if (parsed.token) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + parsed.token, status: undefined }
                    : m
                )
              );
            }
            if (parsed.message) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: parsed.message, metadata: parsed.metadata ?? m.metadata, status: undefined }
                    : m
                )
              );
            }
            if (parsed.status) {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, status: parsed.status } : m))
              );
            }
          } catch { /* ignore malformed */ }
        }
      }

      await loadSessionList();
      isSendingRef.current = false;
      await loadHistory(sessionId);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Regenerate failed');
    } finally {
      isSendingRef.current = false;
      activeAssistantIdRef.current = null;
      setIsLoading(false);
    }
  }, [isLoading, sessionId, modelSettings, systemPrompt, loadSessionList, loadHistory]);

  const sendCompare = useCallback(
    async (text, model2) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading || !model2?.trim()) return;

      setError(null);
      setIsLoading(true);
      isSendingRef.current = true;

      const userMsg = { id: crypto.randomUUID(), role: 'user', content: trimmed };
      const compareMsg = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        streaming: true,
        status: 'Comparing models…',
        compare: true,
        compareResponses: [
          { model: modelSettings.model, content: '' },
          { model: model2.trim(), content: '' },
        ],
      };

      setMessages((prev) => [...prev, userMsg, compareMsg]);
      const compareId = compareMsg.id;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(apiUrl('/api/chat/compare'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            sessionId,
            model2: model2.trim(),
            systemPrompt,
            ...toApiPayload(modelSettings),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Compare failed (${res.status})`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') {
              setMessages((prev) =>
                prev.map((m) => (m.id === compareId ? { ...m, streaming: false, status: undefined } : m))
              );
              continue;
            }
            try {
              const parsed = JSON.parse(payload);
              if (parsed.model && parsed.token) {
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== compareId) return m;
                    const updated = (m.compareResponses || []).map((r) =>
                      r.model === parsed.model
                        ? { ...r, content: r.content + parsed.token }
                        : r
                    );
                    return { ...m, compareResponses: updated, status: undefined };
                  })
                );
              }
              if (parsed.compare && parsed.responses) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === compareId
                      ? { ...m, compareResponses: parsed.responses, streaming: false }
                      : m
                  )
                );
              }
              if (parsed.status) {
                setMessages((prev) =>
                  prev.map((m) => (m.id === compareId ? { ...m, status: parsed.status } : m))
                );
              }
            } catch { /* ignore */ }
          }
        }

        await loadSessionList();
        isSendingRef.current = false;
      } catch (err) {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Compare failed');
      } finally {
        isSendingRef.current = false;
        activeAssistantIdRef.current = null;
        setIsLoading(false);
      }
    },
    [isLoading, sessionId, modelSettings, systemPrompt, loadSessionList]
  );

  const keepCompareResponse = useCallback(
    async (messageId, responseIndex) => {
      const msg = messages.find((m) => m.id === messageId);
      const kept = msg?.compareResponses?.[responseIndex];
      if (!kept) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId || !m.compareResponses) return m;
          return {
            ...m,
            content: kept.content,
            compare: false,
            compareResponses: undefined,
          };
        })
      );

      await fetch(apiUrl('/api/chat/keep'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, content: kept.content }),
      }).catch(() => {});
    },
    [messages, sessionId]
  );

  return {
    messages,
    sessions,
    isLoading,
    error,
    sessionId,
    sendMessage,
    stopGeneration,
    copyLastAssistant,
    newChat,
    selectSession,
    deleteSession,
    clearChat: newChat,
    editMessage,
    regenerateLastResponse,
    sendCompare,
    keepCompareResponse,
  };
}
