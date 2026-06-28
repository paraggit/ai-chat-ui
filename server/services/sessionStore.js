/**
 * In-memory session store with conversation memory.
 * Swap implementation for Redis / vector DB without changing callers.
 */

/**
 * @typedef {{
 *   role: string,
 *   content: string,
 *   images?: string[],
 *   metadata?: Record<string, unknown>,
 * }} SessionMessage
 */

/**
 * @typedef {{
 *   messages: SessionMessage[],
 *   conversationSummary: string,
 *   longTermMemory: string[],
 *   lastSummarizedIndex: number,
 * }} SessionData
 */

class MemorySessionStore {
  constructor() {
    /** @type {Map<string, SessionData>} */
    this.sessions = new Map();
  }

  /**
   * @param {string} sessionId
   * @returns {SessionData}
   */
  _ensure(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        messages: [],
        conversationSummary: '',
        longTermMemory: [],
        lastSummarizedIndex: 0,
      });
    }
    return /** @type {SessionData} */ (this.sessions.get(sessionId));
  }

  /**
   * @param {string} sessionId
   * @returns {SessionMessage[]}
   */
  getHistory(sessionId) {
    return this._ensure(sessionId).messages;
  }

  /**
   * @param {string} sessionId
   */
  getMemory(sessionId) {
    const session = this._ensure(sessionId);
    return {
      conversationSummary: session.conversationSummary,
      longTermMemory: [...session.longTermMemory],
      lastSummarizedIndex: session.lastSummarizedIndex,
    };
  }

  /**
   * @param {string} sessionId
   * @param {SessionMessage} message
   */
  appendMessage(sessionId, message) {
    const session = this._ensure(sessionId);
    session.messages.push(message);
    return session.messages;
  }

  /**
   * @param {string} sessionId
   * @param {string} summary
   */
  setConversationSummary(sessionId, summary) {
    this._ensure(sessionId).conversationSummary = summary;
  }

  /**
   * @param {string} sessionId
   * @param {number} index
   */
  setLastSummarizedIndex(sessionId, index) {
    this._ensure(sessionId).lastSummarizedIndex = Math.max(0, index);
  }

  /**
   * @param {string} sessionId
   * @param {string[]} facts
   */
  mergeLongTermMemory(sessionId, facts) {
    const session = this._ensure(sessionId);
    const existing = new Set(session.longTermMemory.map((f) => f.toLowerCase()));
    for (const fact of facts) {
      const trimmed = fact.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!existing.has(key)) {
        existing.add(key);
        session.longTermMemory.push(trimmed);
      }
    }
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
