import { useCallback, useEffect, useRef, useState } from 'react';
import { getSessionId, resetSessionId } from '../utils/session.js';
import { toApiPayload } from '../utils/modelSettings.js';
import { apiUrl } from '../utils/api.js';

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
 * @param {import('../utils/modelSettings.js').loadModelSettings extends () => infer R ? R : never} modelSettings
 */
export function useChat(modelSettings) {
  const [messages, setMessages] = useState(/** @type {Message[]} */ ([]));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [sessionId, setSessionId] = useState(getSessionId);
  const abortRef = useRef(/** @type {AbortController | null} */ (null));
  const isSendingRef = useRef(false);

  const loadHistory = useCallback(async (sid) => {
    if (isSendingRef.current) return;
    try {
      const res = await fetch(apiUrl(`/api/chat/${sid}`));
      if (!res.ok) return;
      const data = await res.json();
      const history = (data.history ?? []).map((m, i) => ({
        id: `${sid}-${i}`,
        role: m.role,
        content: m.content ?? '',
        images: m.images,
        metadata: m.metadata,
      }));
      setMessages(history);
    } catch {
      // Server may be down on first load — ignore
    }
  }, []);

  useEffect(() => {
    loadHistory(sessionId);
  }, [sessionId, loadHistory]);

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
      } catch (err) {
        if (err.name === 'AbortError') return;
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
        setIsLoading(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id && m.streaming
              ? { ...m, streaming: false }
              : m
          )
        );
      }
    },
    [isLoading, sessionId, modelSettings]
  );

  const clearChat = useCallback(async () => {
    abortRef.current?.abort();
    const oldSessionId = sessionId;
    const newSessionId = resetSessionId();
    setSessionId(newSessionId);
    setMessages([]);
    setError(null);

    try {
      await fetch(apiUrl('/api/chat'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: oldSessionId }),
      });
    } catch {
      // Non-critical
    }
  }, [sessionId]);

  return { messages, isLoading, error, sessionId, sendMessage, clearChat };
}
