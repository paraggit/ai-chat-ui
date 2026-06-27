const DARK_MODE_KEY = 'hf-chat-pro-dark-mode';

/**
 * @returns {boolean}
 */
export function getInitialDarkMode() {
  const stored = localStorage.getItem(DARK_MODE_KEY);
  if (stored !== null) return stored === 'true';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * @param {boolean} isDark
 */
export function setDarkMode(isDark) {
  localStorage.setItem(DARK_MODE_KEY, String(isDark));
  document.documentElement.classList.toggle('dark', isDark);
}
