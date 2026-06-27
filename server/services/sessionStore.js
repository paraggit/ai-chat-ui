/**
 * In-memory session store. Swap implementation for Redis without changing callers.
 */
class MemorySessionStore {
  constructor() {
    /** @type {Map<string, Array<{ role: string, content: string }>>} */
    this.sessions = new Map();
  }

  /**
   * @param {string} sessionId
   * @returns {Array<{ role: string, content: string }>}
   */
  getHistory(sessionId) {
    return this.sessions.get(sessionId) ?? [];
  }

  /**
   * @param {string} sessionId
   * @param {{ role: string, content: string }} message
   */
  appendMessage(sessionId, message) {
    const history = this.getHistory(sessionId);
    history.push(message);
    this.sessions.set(sessionId, history);
    return history;
  }

  /**
   * @param {string} sessionId
   */
  clearSession(sessionId) {
    this.sessions.delete(sessionId);
  }

  /**
   * @param {string} sessionId
   */
  hasSession(sessionId) {
    return this.sessions.has(sessionId);
  }
}

export const sessionStore = new MemorySessionStore();
