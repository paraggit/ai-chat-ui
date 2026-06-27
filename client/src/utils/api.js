/**
 * Always use same-origin /api paths so Vite proxy handles SSL in dev.
 * @param {string} path
 */
export function apiUrl(path) {
  return path;
}
