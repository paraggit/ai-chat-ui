import { useState, useEffect, useRef } from 'react';
import { exportSessionAsJson, exportSessionAsMarkdown } from '../utils/export.js';

/**
 * @param {{
 *   sessions: Array<{ id: string, title: string, updatedAt: string, messageCount: number }>,
 *   activeSessionId: string,
 *   onSelect: (id: string) => void,
 *   onDelete: (id: string) => void,
 *   disabled?: boolean,
 * }} props
 */
export default function ChatHistoryList({
  sessions,
  activeSessionId,
  onSelect,
  onDelete,
  disabled,
}) {
  const [exportOpen, setExportOpen] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!exportOpen) return;

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setExportOpen(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportOpen]);
  if (sessions.length === 0) {
    return (
      <p className="px-1 py-2 text-[11px] text-gray-400">
        No saved chats yet. Start a conversation to build history.
      </p>
    );
  }

  const formatDate = (iso) => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return '';
    }
  };

  return (
    <ul className="space-y-1">
      {sessions.map((session) => {
        const active = session.id === activeSessionId;
        return (
          <li key={session.id}>
            <div
              className={`group flex items-start gap-1 rounded-lg border px-2 py-2 transition ${
                active
                  ? 'border-accent/40 bg-accent/10 dark:bg-accent/15'
                  : 'border-transparent hover:border-gray-200 hover:bg-white dark:hover:border-gray-600 dark:hover:bg-surface-dark'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(session.id)}
                disabled={disabled}
                className="min-w-0 flex-1 text-left"
                title={session.title}
              >
                <p
                  className={`truncate text-xs font-medium ${
                    active ? 'text-accent dark:text-emerald-300' : 'text-gray-700 dark:text-gray-200'
                  }`}
                >
                  {session.title || 'New chat'}
                </p>
                <p className="mt-0.5 text-[10px] text-gray-400">
                  {formatDate(session.updatedAt)} · {session.messageCount} msgs
                </p>
              </button>
              <div className="relative flex items-start gap-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExportOpen(exportOpen === session.id ? null : session.id);
                  }}
                  disabled={disabled}
                  className="rounded p-1 text-gray-400 opacity-0 transition hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100 dark:hover:bg-gray-700"
                  title="Export chat"
                  aria-label={`Export ${session.title}`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>

                {exportOpen === session.id && (
                  <div ref={dropdownRef} className="absolute right-0 top-7 z-10 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-surface-dark">
                    <button
                      type="button"
                      onClick={() => { exportSessionAsJson(session.id); setExportOpen(null); }}
                      className="block w-full px-3 py-1 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      Export as JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => { exportSessionAsMarkdown(session.id); setExportOpen(null); }}
                      className="block w-full px-3 py-1 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      Export as Markdown
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(session.id);
                  }}
                  disabled={disabled}
                  className="rounded p-1 text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-950/40"
                  title="Delete chat"
                  aria-label={`Delete ${session.title}`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
