import ModelSettings from './ModelSettings.jsx';

/**
 * @param {{
 *   onNewChat: () => void,
 *   isDark: boolean,
 *   onToggleDark: () => void,
 *   sessionId: string,
 *   settings: { apiKey: string, model: string, endpoint: string },
 *   configured: boolean,
 *   onSaveSettings: (settings: { apiKey: string, model: string, endpoint: string }) => void,
 * }} props
 */
export default function Sidebar({
  onNewChat,
  isDark,
  onToggleDark,
  sessionId,
  settings,
  configured,
  onSaveSettings,
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-surface-secondary dark:border-gray-700 dark:bg-surface-dark-secondary">
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-4 dark:border-gray-700">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
          <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </div>
        <span className="font-semibold text-gray-800 dark:text-gray-100">HF Chat Pro</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium transition hover:bg-white dark:border-gray-600 dark:hover:bg-surface-dark"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New chat
        </button>

        <div className="mt-4 px-1">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Current session</p>
          <p className="mt-1 truncate font-mono text-xs text-gray-500 dark:text-gray-400" title={sessionId}>
            {sessionId.slice(0, 8)}…
          </p>
        </div>

        <ModelSettings
          settings={settings}
          configured={configured}
          onSave={onSaveSettings}
        />
      </div>

      <div className="border-t border-gray-200 p-3 dark:border-gray-700">
        <button
          type="button"
          onClick={onToggleDark}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition hover:bg-white dark:text-gray-300 dark:hover:bg-surface-dark"
        >
          {isDark ? (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
              Light mode
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
              Dark mode
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
