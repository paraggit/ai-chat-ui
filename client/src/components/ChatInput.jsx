import { useRef } from 'react';

/**
 * @param {{ onSend: (text: string) => void, disabled: boolean, configured: boolean }} props
 */
export default function ChatInput({ onSend, disabled, configured }) {
  const inputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = inputRef.current?.value ?? '';
    if (!text.trim()) return;
    onSend(text);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-4 dark:border-gray-700 dark:bg-surface-dark">
      {!configured && (
        <div className="mx-auto mb-3 max-w-3xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Configure your Hugging Face API key and model in the sidebar settings before chatting.
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border border-gray-200 bg-surface-secondary px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-surface-dark-secondary"
      >
        <textarea
          ref={inputRef}
          rows={1}
          placeholder="Message HF Chat Pro…"
          disabled={disabled || !configured}
          onKeyDown={handleKeyDown}
          className="max-h-40 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-gray-400 disabled:opacity-50 dark:placeholder:text-gray-500"
        />
        <button
          type="submit"
          disabled={disabled || !configured}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send message"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 12h14M12 5l7 7-7 7"
            />
          </svg>
        </button>
      </form>
      <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-gray-400">
        Powered by Hugging Face Inference API
      </p>
    </div>
  );
}
