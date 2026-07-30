import { useEffect, useRef, useState } from 'react';

/**
 * @param {{
 *   value: string,
 *   onChange: (prompt: string) => void,
 * }} props
 */
export default function SystemPrompt({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const timerRef = useRef(null);

  useEffect(() => {
    clearTimeout(timerRef.current);
    setDraft(value);
  }, [value]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleChange = (e) => {
    const next = e.target.value;
    setDraft(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(next), 500);
  };

  const handleBlur = () => {
    clearTimeout(timerRef.current);
    onChange(draft);
  };

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-xs font-medium uppercase tracking-wide text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        <span>System prompt</span>
        <svg
          className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-surface-dark">
          <textarea
            value={draft}
            onChange={handleChange}
            onBlur={handleBlur}
            rows={4}
            placeholder="You are a helpful AI assistant."
            className="w-full resize-y rounded-md border border-gray-200 bg-surface-secondary px-2.5 py-2 text-xs outline-none focus:border-accent dark:border-gray-600 dark:bg-surface-dark-secondary"
          />
          <p className="mt-1 text-[10px] leading-snug text-gray-400">
            Instructions the model follows throughout this conversation. Saved per chat session.
          </p>
        </div>
      )}
    </div>
  );
}
