/**
 * storage.js — IndexedDB Persistence Layer via localforage
 *
 * Data model:
 *   "user_threads"        → Array<Thread>
 *   "messages_{peerId}"   → Array<Message>
 *
 * Thread shape:
 *   { peerId, alias, lastMessage, lastMessageTimestamp, isPinned, unreadCount }
 *
 * Message shape:
 *   { id, direction, text, sentAt, expiresInMs, kind }
 */

const Storage = (() => {
  let _store = null;
  let _userId = null;

  /** Initialise a namespaced localforage instance for the current user. */
  function init(userId) {
    _userId = userId;
    _store = localforage.createInstance({
      name: `teenlink_${userId}`,
      storeName: "chat_data",
      description: "TeenLink local chat persistence",
    });
  }

  // ─── Threads ──────────────────────────────────────────────

  async function _rawThreads() {
    return (await _store.getItem("user_threads")) || [];
  }

  /** Return threads sorted: pinned first, then by lastMessageTimestamp desc. */
  async function getThreads() {
    const threads = await _rawThreads();
    return threads.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0);
    });
  }

  /** Get a single thread or create a stub if it doesn't exist. */
  async function getOrCreateThread(peerId) {
    const threads = await _rawThreads();
    let thread = threads.find((t) => t.peerId === peerId);
    if (!thread) {
      thread = {
        peerId,
        alias: peerId,
        lastMessage: "",
        lastMessageTimestamp: Date.now(),
        isPinned: false,
        unreadCount: 0,
      };
      threads.push(thread);
      await _store.setItem("user_threads", threads);
    }
    return thread;
  }

  /** Partial-update a thread by peerId. */
  async function updateThread(peerId, updates) {
    const threads = await _rawThreads();
    const idx = threads.findIndex((t) => t.peerId === peerId);
    if (idx === -1) return;
    Object.assign(threads[idx], updates);
    await _store.setItem("user_threads", threads);
  }

  /** Toggle the isPinned boolean for a thread. */
  async function togglePin(peerId) {
    const threads = await _rawThreads();
    const thread = threads.find((t) => t.peerId === peerId);
    if (!thread) return;
    thread.isPinned = !thread.isPinned;
    await _store.setItem("user_threads", threads);
    return thread.isPinned;
  }

  /** Reset unread count to 0. */
  async function clearUnread(peerId) {
    await updateThread(peerId, { unreadCount: 0 });
  }

  /** Increment unread count by 1. */
  async function incrementUnread(peerId) {
    const threads = await _rawThreads();
    const thread = threads.find((t) => t.peerId === peerId);
    if (!thread) return;
    thread.unreadCount = (thread.unreadCount || 0) + 1;
    await _store.setItem("user_threads", threads);
  }

  /** Delete a thread and its messages. */
  async function deleteThread(peerId) {
    let threads = await _rawThreads();
    threads = threads.filter((t) => t.peerId !== peerId);
    await _store.setItem("user_threads", threads);
    await _store.removeItem(`messages_${peerId}`);
  }

  // ─── Messages ─────────────────────────────────────────────

  /** Get all messages for a peer. */
  async function getMessages(peerId) {
    return (await _store.getItem(`messages_${peerId}`)) || [];
  }

  /**
   * Append a message for a peer, update the thread snippet & timestamp.
   * Creates the thread if it doesn't exist.
   */
  async function appendMessage(peerId, msgObj) {
    // Ensure thread exists
    await getOrCreateThread(peerId);

    // Append message
    const msgs = await getMessages(peerId);
    msgs.push(msgObj);
    await _store.setItem(`messages_${peerId}`, msgs);

    // Update thread
    const snippet =
      msgObj.kind === "file"
        ? "📎 File"
        : msgObj.kind === "system"
          ? msgObj.text
          : msgObj.text;
    const truncated = snippet.length > 50 ? snippet.slice(0, 50) + "…" : snippet;

    await updateThread(peerId, {
      lastMessage: truncated,
      lastMessageTimestamp: msgObj.sentAt || Date.now(),
    });
  }

  /** Remove a specific message by ID from a peer's history. */
  async function removeMessage(peerId, messageId) {
    let msgs = await getMessages(peerId);
    msgs = msgs.filter((m) => m.id !== messageId);
    await _store.setItem(`messages_${peerId}`, msgs);
  }

  // ─── Public API ───────────────────────────────────────────

  return {
    init,
    getThreads,
    getOrCreateThread,
    updateThread,
    togglePin,
    clearUnread,
    incrementUnread,
    deleteThread,
    getMessages,
    appendMessage,
    removeMessage,
  };
})();
