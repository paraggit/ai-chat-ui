import MarkdownContent from './MarkdownContent.jsx';

/**
 * @param {{
 *   responses: Array<{ model: string, content: string }>,
 *   onKeep: (index: number) => void,
 *   isDark: boolean,
 *   streaming: boolean,
 * }} props
 */
export default function CompareView({ responses, onKeep, isDark, streaming }) {
  return (
    <div className="flex w-full gap-3">
      {responses.map((r, i) => (
        <div
          key={r.model}
          className="flex-1 min-w-0 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-surface-dark"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {r.model}
            </span>
            {!streaming && (
              <button
                type="button"
                onClick={() => onKeep(i)}
                className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition hover:bg-accent-hover"
              >
                Keep this
              </button>
            )}
          </div>
          {r.content ? (
            <MarkdownContent content={r.content} isDark={isDark} />
          ) : (
            <p className="text-sm text-gray-400 italic">Generating…</p>
          )}
        </div>
      ))}
    </div>
  );
}
