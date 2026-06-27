import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble.jsx';

/**
 * @param {{ messages: Array<{ id: string, role: string, content: string, streaming?: boolean }>, isDark: boolean }} props
 */
export default function MessageList({ messages, isDark }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6">
      {messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
            <svg
              className="h-8 w-8 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
            HF Chat Pro
          </h2>
          <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
            Start a conversation powered by Hugging Face. Your messages stream in
            real-time with full conversation memory.
          </p>
        </div>
      ) : (
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} isDark={isDark} />
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
