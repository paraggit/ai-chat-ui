const SESSION_KEY = 'hf-chat-pro-session-id';

/**
 * Get or create a persistent session ID.
 * @returns {string}
 */
export function getSessionId() {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

/**
 * Switch to an existing chat session.
 * @param {string} sessionId
 */
export function setSessionId(sessionId) {
  localStorage.setItem(SESSION_KEY, sessionId);
}

/**
 * Start a new chat session.
 * @returns {string}
 */
export function resetSessionId() {
  const sessionId = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, sessionId);
  return sessionId;
}
