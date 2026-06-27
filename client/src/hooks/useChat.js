import { useCallback, useEffect, useRef, useState } from 'react';
import { getSessionId, resetSessionId } from '../utils/session.js';
import { toApiPayload } from '../utils/modelSettings.js';

/**
 * @typedef {{ id: string, role: 'user' | 'assistant', content: string, streaming?: boolean }} Message
 */

/**
 * @param {{ apiKey: string, model: string, endpoint: string }} modelSettings
 * @returns {{
 *   messages: Message[],
 *   isLoading: boolean,
 *   error: string | null,
 *   sessionId: string,
 *   sendMessage: (text: string) => Promise<void>,
 *   clearChat: () => Promise<void>,
 * }}
 */
export function useChat(modelSettings) {
  const [messages, setMessages] = useState(/** @type {Message[]} */ ([]));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [sessionId, setSessionId] = useState(getSessionId);
  const abortRef = useRef(/** @type {AbortController | null} */ (null));

  const loadHistory = useCallback(async (sid) => {
    try {
      const res = await fetch(`/api/chat/${sid}`);
      if (!res.ok) return;
      const data = await res.json();
      const history = (data.history ?? []).map((m, i) => ({
        id: `${sid}-${i}`,
        role: m.role,
        content: m.content,
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
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      setError(null);
      setIsLoading(true);

      const userMsg = /** @type {Message} */ ({
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
      });

      const assistantMsg = /** @type {Message} */ ({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        streaming: true,
      });

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            sessionId,
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
              if (parsed.token) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: m.content + parsed.token }
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
      await fetch('/api/chat', {
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
