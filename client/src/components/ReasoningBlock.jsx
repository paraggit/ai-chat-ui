import { useState } from 'react';

/**
 * @param {Record<string, unknown> | null | undefined} metadata
 * @returns {string | null}
 */
export function getReasoning(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const reasoning = metadata.reasoning;
  return typeof reasoning === 'string' && reasoning.trim() ? reasoning.trim() : null;
}

/**
 * @param {{ reasoning: string, streaming?: boolean }} props
 */
export default function ReasoningBlock({ reasoning, streaming }) {
  const [expanded, setExpanded] = useState(true);

  if (!reasoning) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-amber-200/80 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-amber-800 transition hover:bg-amber-100/60 dark:text-amber-200 dark:hover:bg-amber-900/30"
        aria-expanded={expanded}
      >
        <svg
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>Reasoning</span>
        {streaming && (
          <span className="ml-auto text-[10px] font-normal opacity-70">thinking…</span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-amber-200/80 px-3 py-2 dark:border-amber-900/50">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-amber-950/90 dark:text-amber-100/90">
            {reasoning}
          </p>
        </div>
      )}
    </div>
  );
}
