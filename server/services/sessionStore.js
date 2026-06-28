import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR =
  process.env.SESSION_DATA_DIR || path.join(__dirname, '../../data/sessions');

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
 *   id: string,
 *   title: string,
 *   createdAt: string,
 *   updatedAt: string,
 *   messages: SessionMessage[],
 *   conversationSummary: string,
 *   longTermMemory: string[],
 *   lastSummarizedIndex: number,
 * }} SessionData
 */

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   createdAt: string,
 *   updatedAt: string,
 *   messageCount: number,
 * }} SessionSummary
 */

class PersistentSessionStore {
  constructor() {
    /** @type {Map<string, SessionData>} */
    this.sessions = new Map();
    this._loadAll();
  }

  _sessionPath(sessionId) {
    return path.join(DATA_DIR, `${sessionId}.json`);
  }

  _loadAll() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      return;
    }

    for (const file of fs.readdirSync(DATA_DIR)) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
        const data = JSON.parse(raw);
        if (data?.id) {
          this.sessions.set(data.id, this._normalize(data));
        }
      } catch (error) {
        console.warn(`[sessionStore] Skipped corrupt session file ${file}:`, error.message);
      }
    }

    console.log(`[sessionStore] Loaded ${this.sessions.size} conversation(s) from disk`);
  }

  /**
   * @param {Partial<SessionData> & { id: string }} data
   * @returns {SessionData}
   */
  _normalize(data) {
    const now = new Date().toISOString();
    return {
      id: data.id,
      title: data.title || 'New chat',
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      messages: Array.isArray(data.messages) ? data.messages : [],
      conversationSummary: data.conversationSummary || '',
      longTermMemory: Array.isArray(data.longTermMemory) ? data.longTermMemory : [],
      lastSummarizedIndex: Number.isFinite(data.lastSummarizedIndex) ? data.lastSummarizedIndex : 0,
    };
  }

  /**
   * @param {string} sessionId
   * @returns {SessionData}
   */
  _ensure(sessionId) {
    if (!this.sessions.has(sessionId)) {
      const now = new Date().toISOString();
      this.sessions.set(sessionId, {
        id: sessionId,
        title: 'New chat',
        createdAt: now,
        updatedAt: now,
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
   */
  _persist(sessionId) {
    const session = this._ensure(sessionId);
    session.updatedAt = new Date().toISOString();
    fs.writeFileSync(this._sessionPath(sessionId), JSON.stringify(session, null, 2), 'utf8');
  }

  /**
   * @returns {SessionSummary[]}
   */
  listSessions() {
    return [...this.sessions.values()]
      .map((session) => ({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
      }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
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

    if (session.title === 'New chat' && message.role === 'user' && message.content?.trim()) {
      session.title = message.content.trim().slice(0, 72);
    }

    this._persist(sessionId);
    return session.messages;
  }

  /**
   * @param {string} sessionId
   * @param {string} title
   */
  setTitle(sessionId, title) {
    const session = this._ensure(sessionId);
    session.title = title.trim().slice(0, 120) || 'New chat';
    this._persist(sessionId);
  }

  /**
   * @param {string} sessionId
   * @param {string} summary
   */
  setConversationSummary(sessionId, summary) {
    this._ensure(sessionId).conversationSummary = summary;
    this._persist(sessionId);
  }

  /**
   * @param {string} sessionId
   * @param {number} index
   */
  setLastSummarizedIndex(sessionId, index) {
    this._ensure(sessionId).lastSummarizedIndex = Math.max(0, index);
    this._persist(sessionId);
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
    this._persist(sessionId);
  }

  /**
   * @param {string} sessionId
   */
  clearSession(sessionId) {
    this.sessions.delete(sessionId);
    const filePath = this._sessionPath(sessionId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * @param {string} sessionId
   */
  hasSession(sessionId) {
    return this.sessions.has(sessionId);
  }
}

export const sessionStore = new PersistentSessionStore();
