import { useEffect } from 'react';

/**
 * @param {{ metadata: Record<string, unknown>, onClose: () => void }} props
 */
export default function MetadataModal({ metadata, onClose }) {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const formatValue = (value) => {
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  };

  const technical = getTechnicalMetadata(metadata);
  const entries = technical ? Object.entries(technical) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-surface-dark"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="metadata-title"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 id="metadata-title" className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Response metadata
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[calc(80vh-3.5rem)] overflow-y-auto p-4">
          <dl className="space-y-4">
            {entries.map(([key, value]) => (
              <div key={key}>
                <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </dt>
                <dd className="whitespace-pre-wrap rounded-lg bg-surface-secondary p-3 font-mono text-xs text-gray-700 dark:bg-surface-dark-secondary dark:text-gray-200">
                  {formatValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

/**
 * Metadata shown in the Info modal (reasoning is displayed inline in the message).
 * @param {Record<string, unknown> | null | undefined} metadata
 */
export function getTechnicalMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const { reasoning: _reasoning, ...rest } = metadata;
  return Object.keys(rest).length > 0 ? rest : null;
}

/**
 * @param {Record<string, unknown> | null | undefined} metadata
 */
export function hasMetadata(metadata) {
  return Boolean(getTechnicalMetadata(metadata));
}
