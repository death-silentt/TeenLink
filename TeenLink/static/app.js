
const state = {
  myId: null,
  myEmail: null,
  activePeerId: null,
  isPublic: false,
  signalingSocket: null,
  peers: {}, // Map of peerId -> { peerConnection, dataChannel, cryptoKey, ecdhKeyPair, pendingCandidates, fileTransfers, typingTimeout, remoteTypingTimeout }
  publicUsers: [],
  onlineUsers: new Set(),
  friendIds: [],
  authEmail: "",
  qrCode: null,
  nicknames: {},
  avatarCache: {},
  pendingProfileLoads: new Set(),
};

const config = {
  rtc: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  },
  chunkSize: 16 * 1024,
  typingStopDelayMs: 1200,
};

const elements = {
  authShell: document.getElementById("auth-shell"),
  appShell: document.getElementById("app-shell"),
  authFormsContainer: document.getElementById("auth-forms-container"),
  authConfirmation: document.getElementById("auth-confirmation"),
  confirmContinueBtn: document.getElementById("confirm-continue-btn"),
  authStatusContainer: document.getElementById("auth-status-container"),
  showRegister: document.getElementById("show-register"),
  showLogin: document.getElementById("show-login"),
  registerForm: document.getElementById("register-form"),
  verifyForm: document.getElementById("verify-form"),
  passwordForm: document.getElementById("password-form"),
  loginForm: document.getElementById("login-form"),
  forgotEmailForm: document.getElementById("forgot-email-form"),
  forgotOtpForm: document.getElementById("forgot-otp-form"),
  showForgotPassword: document.getElementById("show-forgot-password"),
  backToLogin: document.getElementById("back-to-login"),
  forgotEmail: document.getElementById("forgot-email"),
  forgotOtp: document.getElementById("forgot-otp"),
  forgotNewPassword: document.getElementById("forgot-new-password"),
  nameForm: document.getElementById("name-form"),
  firstName: document.getElementById("first-name"),
  lastName: document.getElementById("last-name"),
  registerEmail: document.getElementById("register-email"),
  verifyOtp: document.getElementById("verify-otp"),
  setPassword: document.getElementById("set-password"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  authStatus: document.getElementById("auth-status"),
  myId: document.getElementById("my-id"),
  myEmail: document.getElementById("my-email"),
  myAvatar: document.getElementById("my-avatar"),
  profileUpload: document.getElementById("profile-upload"),
  wsStatus: document.getElementById("ws-status"),
  publicToggle: document.getElementById("public-toggle"),
  privateId: document.getElementById("private-id"),
  connectPrivate: document.getElementById("connect-private"),
  privateSearchResult: document.getElementById("private-search-result"),
  refreshUsers: document.getElementById("refresh-users"),
  publicUsers: document.getElementById("public-users"),
  chatSubtitle: document.getElementById("chat-subtitle"),
  peerStatus: document.getElementById("peer-status"),
  chatHeaderName: document.getElementById("chat-header-name"),
  chatHeaderDot: document.getElementById("chat-header-dot"),
  chatHeaderAvatarImg: document.getElementById("chat-header-avatar-img"),
  editNicknameBtn: document.getElementById("edit-nickname-btn"),
  typingIndicator: document.getElementById("typing-indicator"),
  expirySelect: document.getElementById("expiry-select"),
  messages: document.getElementById("messages"),
  messageInput: document.getElementById("message-input"),
  fileInput: document.getElementById("file-input"),
  sendBtn: document.getElementById("send-btn"),
  disconnectBtn: document.getElementById("disconnect-btn"),
  messageTemplate: document.getElementById("message-template"),
  shareIdBtn: document.getElementById("share-id-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  qrModal: document.getElementById("qr-modal"),
  closeQrModal: document.getElementById("close-qr-modal"),
  qrCode: document.getElementById("qr-code"),
  qrIdLabel: document.getElementById("qr-id-label"),
  
  // New Layout Elements
  inboxSidebar: document.getElementById("inbox-sidebar"),
  chatPanel: document.getElementById("chat-panel"),
  discoveryPanel: document.getElementById("discovery-panel"),
  threadList: document.getElementById("thread-list"),
  toggleDiscoveryBtn: document.getElementById("toggle-discovery-btn"),
  closeDiscoveryBtn: document.getElementById("close-discovery-btn"),
  backToInboxBtn: document.getElementById("back-to-inbox-btn"),
  chatEmptyState: document.getElementById("chat-empty-state"),
  
  // Sidebar Tabs & Friends List
  sidebarTabChats: document.getElementById("sidebar-tab-chats"),
  sidebarTabFriends: document.getElementById("sidebar-tab-friends"),
  sidebarChatsContent: document.getElementById("sidebar-chats-content"),
  sidebarFriendsContent: document.getElementById("sidebar-friends-content"),
  friendsList: document.getElementById("friends-list"),
  friendsOnlineCount: document.getElementById("friends-online-count"),
  
  // Friend Request Elements
  showRequestsBtn: document.getElementById("show-requests-btn"),
  requestsBadge: document.getElementById("requests-badge"),
  requestsModal: document.getElementById("requests-modal"),
  closeRequestsModal: document.getElementById("close-requests-modal"),
  requestsList: document.getElementById("requests-list"),
  toastContainer: document.getElementById("toast-container"),

  // Nickname Modal
  nicknameModal: document.getElementById("nickname-modal"),
  closeNicknameModal: document.getElementById("close-nickname-modal"),
  nicknameForm: document.getElementById("nickname-form"),
  nicknameInput: document.getElementById("nickname-input"),
  removeNicknameBtn: document.getElementById("remove-nickname-btn"),

  // Media Pickers
  mediaPickerBtn: document.getElementById("media-picker-btn"),
  mediaPicker: document.getElementById("media-picker"),
  mediaTabs: document.querySelectorAll(".media-tab"),
  mediaPanels: document.querySelectorAll(".media-panel"),
  emojiGrid: document.getElementById("emoji-grid"),
  gifGrid: document.getElementById("gif-grid"),
  gifSearch: document.getElementById("gif-search"),
};

let hasInitialized = false;

async function init() {
  bindEvents();
  const hasSession = await bootstrapSession();
  if (!hasSession) {
    showAuthMode("register");
  }
}

function startApp() {
  if (hasInitialized) {
    return;
  }
  hasInitialized = true;
  init().catch((error) => {
    console.error("Failed to initialize TeenLink app", error);
  });
}

function bindEvents() {
  elements.showRegister.addEventListener("click", () => showAuthMode("register"));
  elements.showLogin.addEventListener("click", () => showAuthMode("login"));
  elements.registerForm.addEventListener("submit", handleRegister);
  elements.verifyForm.addEventListener("submit", handleVerify);
  elements.confirmContinueBtn.addEventListener("click", () => {
    elements.authConfirmation.classList.add("hidden");
    elements.authConfirmation.classList.remove("flex");
    elements.authFormsContainer.classList.remove("hidden");
    elements.loginEmail.value = state.authEmail;
    showAuthMode("login");
  });
  elements.passwordForm.addEventListener("submit", handleSetPassword);
  elements.nameForm?.addEventListener("submit", handleSetName);
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.showForgotPassword.addEventListener("click", () => showForgotPasswordMode());
  elements.backToLogin.addEventListener("click", () => showAuthMode("login"));
  elements.forgotEmailForm.addEventListener("submit", handleForgotPassword);
  elements.forgotOtpForm.addEventListener("submit", handleResetPassword);
  
  if (elements.publicToggle) {
    elements.publicToggle.addEventListener("change", updateVisibility);
  }
  
  if (elements.refreshUsers) {
    elements.refreshUsers.addEventListener("click", refreshPublicUsers);
  }
  
  if (elements.connectPrivate) {
    elements.connectPrivate.addEventListener("click", handlePrivateUserLookup);
  }

  if (elements.privateId) {
    elements.privateId.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handlePrivateUserLookup();
      }
    });
    elements.privateId.addEventListener("input", () => {
      if (!elements.privateId.value.trim()) {
        clearPrivateSearchResult();
      }
    });
  }
  
  elements.sendBtn.addEventListener("click", sendMessage);
  elements.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendMessage();
      return;
    }
    emitTypingStart();
  });
  elements.messageInput.addEventListener("input", () => {
    if (elements.messageInput.value.trim()) {
      emitTypingStart();
      return;
    }
    emitTypingStop();
  });
  elements.messageInput.addEventListener("blur", emitTypingStop);
  
  // Friend Request Events
  elements.showRequestsBtn?.addEventListener("click", () => {
    elements.requestsModal?.classList.remove("hidden");
    elements.requestsModal?.classList.add("flex");
    fetchFriendRequests();
  });
  elements.closeRequestsModal?.addEventListener("click", () => {
    elements.requestsModal?.classList.add("hidden");
    elements.requestsModal?.classList.remove("flex");
  });

  elements.fileInput.addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (file) {
      await sendFile(file);
      event.target.value = "";
    }
  });
  
  elements.disconnectBtn.addEventListener("click", () => {
    if (state.activePeerId) {
      resetConnection(state.activePeerId);
    }
    // Close chat panel and return to starting screen
    elements.chatPanel?.classList.add("translate-x-full");
    elements.inboxSidebar?.classList.remove("-translate-x-full");
    state.activePeerId = null;
    showEmptyState(true);
    renderInbox();
  });
  
  elements.shareIdBtn.addEventListener("click", openQrModal);
  elements.closeQrModal.addEventListener("click", closeQrModal);
  elements.qrModal.addEventListener("click", (event) => {
    if (event.target === elements.qrModal) {
      closeQrModal();
    }
  });
  elements.logoutBtn.addEventListener("click", logout);

  elements.profileUpload?.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
  
    const formData = new FormData();
    formData.append("file", file);
  
    try {
      const response = await fetch("/api/profile/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      
      if (response.ok && data.avatar_url) {
        state.avatarCache[state.myId] = data.avatar_url;
        if (elements.myAvatar) elements.myAvatar.src = data.avatar_url;
        // Refresh avatars in lists if needed, though they usually show other peers.
      } else {
        alert(data.detail || "Failed to upload profile picture.");
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("An error occurred during upload.");
    }
    
    // Reset input
    event.target.value = "";
  });

  // New UI binds
  elements.toggleDiscoveryBtn?.addEventListener("click", () => {
    elements.discoveryPanel?.classList.remove("hidden");
  });
  elements.closeDiscoveryBtn?.addEventListener("click", () => {
    elements.discoveryPanel?.classList.add("hidden");
  });
  elements.backToInboxBtn?.addEventListener("click", () => {
    elements.chatPanel?.classList.add("translate-x-full");
    elements.inboxSidebar?.classList.remove("-translate-x-full");
    state.activePeerId = null;
    showEmptyState(true);
  });

  // Sidebar Tab Switching
  elements.sidebarTabChats?.addEventListener("click", () => switchSidebarTab("chats"));
  elements.sidebarTabFriends?.addEventListener("click", () => switchSidebarTab("friends"));

  // Nickname Events
  elements.editNicknameBtn?.addEventListener("click", () => {
    if (!state.activePeerId) return;
    elements.nicknameInput.value = state.nicknames[state.activePeerId] || "";
    elements.nicknameModal?.classList.remove("hidden");
    elements.nicknameModal?.classList.add("flex");
  });
  elements.closeNicknameModal?.addEventListener("click", () => {
    elements.nicknameModal?.classList.add("hidden");
    elements.nicknameModal?.classList.remove("flex");
  });
  elements.nicknameForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.activePeerId) return;
    const val = elements.nicknameInput.value.trim();
    if (!val) return;
    await setNickname(state.activePeerId, val);
    elements.nicknameModal?.classList.add("hidden");
    elements.nicknameModal?.classList.remove("flex");
  });
  elements.removeNicknameBtn?.addEventListener("click", async () => {
    if (!state.activePeerId) return;
    await removeNickname(state.activePeerId);
    elements.nicknameModal?.classList.add("hidden");
    elements.nicknameModal?.classList.remove("flex");
  });

  // Media Pickers
  elements.mediaPickerBtn?.addEventListener("click", () => {
    elements.mediaPicker?.classList.toggle("hidden");
    if (!elements.mediaPicker?.classList.contains("hidden")) {
      renderEmojis();
      renderGIFs();
    }
  });

  elements.mediaTabs?.forEach(tab => {
    tab.addEventListener("click", (e) => {
      elements.mediaTabs.forEach(t => t.classList.remove("text-glow", "border-glow"));
      elements.mediaTabs.forEach(t => t.classList.add("text-mist", "border-transparent"));
      e.target.classList.remove("text-mist", "border-transparent");
      e.target.classList.add("text-glow", "border-glow");
      
      elements.mediaPanels?.forEach(p => p.classList.add("hidden"));
      const targetId = `${e.target.dataset.mediaTab}-panel`;
      document.getElementById(targetId)?.classList.remove("hidden");
    });
  });

  elements.gifSearch?.addEventListener("input", (e) => {
    clearTimeout(state.gifSearchTimeout);
    state.gifSearchTimeout = setTimeout(() => {
      renderGIFs(e.target.value.trim());
    }, 500);
  });
}

function renderEmojis() {
  if (elements.emojiGrid?.children.length > 0) return;
  const emojis = ["😀", "😂", "🥰", "😎", "🥺", "🤔", "😭", "😡", "👍", "👎", "🔥", "✨", "💯", "🎉", "❤️", "💔"];
  emojis.forEach(e => {
    const btn = document.createElement("button");
    btn.className = "text-2xl p-2 hover:bg-white/10 rounded-xl transition";
    btn.textContent = e;
    btn.addEventListener("click", () => {
      elements.messageInput.value += e;
    });
    elements.emojiGrid?.appendChild(btn);
  });
}

async function renderGIFs(query = "") {
  if (!elements.gifGrid) return;
  elements.gifGrid.innerHTML = '<div class="col-span-3 text-center text-mist text-xs py-4">Loading...</div>';
  const url = query ? `/api/gifs/search?q=${encodeURIComponent(query)}` : `/api/gifs/search`;
  const response = await fetchJson(url);
  if (response.ok && response.data.data) {
    elements.gifGrid.innerHTML = "";
    response.data.data.forEach(gif => {
      const img = document.createElement("img");
      img.src = gif.images.fixed_height_small.url;
      img.className = "w-full h-20 object-cover rounded-xl cursor-pointer hover:opacity-80 transition";
      img.addEventListener("click", () => {
        sendMediaMessage(gif.images.fixed_height.url, "gif");
        elements.mediaPicker?.classList.add("hidden");
      });
      elements.gifGrid.appendChild(img);
    });
  } else {
    elements.gifGrid.innerHTML = "";
    document.getElementById("gif-no-key")?.classList.remove("hidden");
  }
}

async function sendMediaMessage(url, kind) {
  const peerId = state.activePeerId;
  if (!peerId) return;
  const peer = state.peers[peerId];
  if (!channelReady(peerId)) {
    appendSystemMessage("Cannot send: Not connected.");
    return;
  }
  const expiresInMs = Number(elements.expirySelect?.value || "0");
  const sentAt = Date.now();
  const payloadObj = { kind, url, expiresInMs, sentAt, id: crypto.randomUUID() };
  const encrypted = await encryptPayload(payloadObj, peer.cryptoKey);
  peer.dataChannel.send(JSON.stringify({ type: "encrypted", payload: encrypted }));
  const localMsg = { id: payloadObj.id, direction: "outgoing", url, expiresInMs, sentAt, kind };
  if (window.Storage) {
    await Storage.appendMessage(peerId, localMsg);
    renderInbox();
  }
  renderMessageBubble(localMsg);
}

function showEmptyState(show) {
  if (show) {
    elements.chatEmptyState?.classList.remove('hidden');
    elements.chatEmptyState?.classList.add('flex');
    elements.messages.innerHTML = '';
    updatePeerState("No active session", "Disconnected");
  } else {
    elements.chatEmptyState?.classList.add('hidden');
    elements.chatEmptyState?.classList.remove('flex');
  }
}

async function fetchNicknames() {
  const response = await fetchJson("/api/nicknames");
  if (response.ok && response.data) {
    state.nicknames = response.data.nicknames || {};
  }
}

async function setNickname(targetId, nickname) {
  const response = await fetchJson(`/api/nickname/${targetId}`, {
    method: "POST",
    body: JSON.stringify({ nickname })
  });
  if (response.ok) {
    state.nicknames[targetId] = nickname;
    renderInbox();
    refreshPublicUsers();
    updatePeerState(elements.chatSubtitle?.textContent || "No active session", "Connected");
  }
  return response;
}

async function removeNickname(targetId) {
  const response = await fetchJson(`/api/nickname/${targetId}`, { method: "DELETE" });
  if (response.ok) {
    delete state.nicknames[targetId];
    renderInbox();
    refreshPublicUsers();
    updatePeerState(elements.chatSubtitle?.textContent || "No active session", "Connected");
  }
  return response;
}

function getDisplayName(userId) {
  if (state.nicknames[userId]) return state.nicknames[userId];
  const publicUser = state.publicUsers.find(u => u.id === userId);
  if (publicUser && publicUser.display_name) return publicUser.display_name;
  return userId;
}

function getAvatarUrl(userId) {
  if (state.avatarCache[userId]) return state.avatarCache[userId];
  // Fallback: generate DiceBear URL client-side only if backend hasn't provided one yet
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(userId)}&backgroundColor=818cf8,4ade80,fb7185,fb923c&backgroundType=gradientLinear&fontWeight=600`;
}

function clearPrivateSearchResult() {
  if (!elements.privateSearchResult) {
    return;
  }
  elements.privateSearchResult.innerHTML = "";
  elements.privateSearchResult.classList.add("hidden");
}

function renderPrivateSearchResult(user) {
  if (!elements.privateSearchResult) {
    return;
  }

  const isOnline = state.onlineUsers.has(user.id);
  let buttonHtml = "";

  if (user.relation_status === "friends") {
    buttonHtml = `<button class="action-btn px-3 py-1.5 rounded-xl bg-glass-surface border border-glass-border text-xs font-bold text-glow hover:bg-white/10 transition-colors flex items-center gap-1"><i class="ph-bold ph-chat-teardrop-dots"></i> Message</button>`;
  } else if (user.relation_status === "requested") {
    buttonHtml = `<button disabled class="px-3 py-1.5 rounded-xl bg-black/50 border border-glass-border text-xs font-bold text-mist cursor-not-allowed flex items-center gap-1"><i class="ph-bold ph-clock"></i> Requested</button>`;
  } else if (user.relation_status === "pending_incoming") {
    buttonHtml = `<button class="accept-btn px-3 py-1.5 rounded-xl bg-glow/20 border border-glow text-xs font-bold text-glow hover:bg-glow/40 transition-colors flex items-center gap-1"><i class="ph-bold ph-check"></i> Accept</button>`;
  } else if (user.relation_status === "self") {
    buttonHtml = `<button disabled class="px-3 py-1.5 rounded-xl bg-black/50 border border-glass-border text-xs font-bold text-mist cursor-not-allowed flex items-center gap-1"><i class="ph-bold ph-user"></i> Your ID</button>`;
  } else {
    buttonHtml = `<button class="add-friend-btn px-3 py-1.5 rounded-xl bg-white/5 border border-glass-border text-xs font-bold text-mist hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1"><i class="ph-bold ph-user-plus"></i> Add Friend</button>`;
  }

  elements.privateSearchResult.classList.remove("hidden");
  elements.privateSearchResult.innerHTML = `
    <div class="flex w-full items-center justify-between rounded-2xl border border-glass-border bg-black/40 px-4 py-4 transition-all hover:border-glow hover:bg-black/80">
      <div class="flex items-center gap-3 min-w-0">
        <div class="relative flex-shrink-0 h-10 w-10 rounded-full overflow-hidden shadow-glow">
          <img src="${getAvatarUrl(user.id)}" alt="" class="h-full w-full object-cover" onerror="this.src='https://api.dicebear.com/9.x/initials/svg?seed=${user.id}'" />
          <span class="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-obsidian ${isOnline ? "bg-neon-green shadow-green-glow" : "bg-zinc-600"}"></span>
        </div>
        <div class="min-w-0">
          <p class="text-sm font-bold uppercase tracking-wider text-glow truncate">${getDisplayName(user.id)}</p>
          <p class="mt-1 text-[10px] text-mist truncate">${user.id} ${isOnline ? "is online" : "is offline right now."}</p>
        </div>
      </div>
      <div class="action-container ml-3 shrink-0">
        ${buttonHtml}
      </div>
    </div>
  `;

  const actionContainer = elements.privateSearchResult.querySelector(".action-container");
  const actionBtn = actionContainer.querySelector(".action-btn");
  const addBtn = actionContainer.querySelector(".add-friend-btn");
  const acceptBtn = actionContainer.querySelector(".accept-btn");

  if (actionBtn) {
    actionBtn.addEventListener("click", () => {
      elements.discoveryPanel?.classList.add("hidden");
      connectToPeer(user.id, true);
    });
  }

  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      await sendFriendRequest(user.id);
      await ensureUserProfile(user.id);
      renderPrivateSearchResult({
        ...user,
        relation_status: "requested",
      });
    });
  }

  if (acceptBtn) {
    acceptBtn.addEventListener("click", () => {
      elements.requestsModal?.classList.remove("hidden");
      elements.requestsModal?.classList.add("flex");
      fetchFriendRequests();
    });
  }
}

function upsertKnownUser(user) {
  if (!user?.id) {
    return;
  }

  if (user.avatar_url) {
    state.avatarCache[user.id] = user.avatar_url;
  }

  const existing = state.publicUsers.find((entry) => entry.id === user.id);
  if (!existing) {
    state.publicUsers.push({
      id: user.id,
      display_name: user.display_name || user.id,
      is_online: user.is_online ?? state.onlineUsers.has(user.id),
      is_public: user.is_public,
      relation_status: user.relation_status || "none",
    });
    return;
  }

  if (user.display_name) {
    existing.display_name = user.display_name;
  }
  if (user.is_online !== undefined) {
    existing.is_online = user.is_online;
  }
  if (user.is_public !== undefined) {
    existing.is_public = user.is_public;
  }
  if (user.relation_status) {
    existing.relation_status = user.relation_status;
  }
}

async function ensureUserProfile(userId) {
  if (!userId || userId === state.myId) {
    return;
  }

  const existing = state.publicUsers.find((entry) => entry.id === userId);
  if (existing?.display_name && state.avatarCache[userId]) {
    return;
  }
  if (state.pendingProfileLoads.has(userId)) {
    return;
  }

  state.pendingProfileLoads.add(userId);
  try {
    const response = await fetchJson(`/api/users/${encodeURIComponent(userId)}`);
    if (!response.ok || !response.data) {
      return;
    }

    upsertKnownUser(response.data);
    renderInbox();
    renderPublicUsers();
    renderFriendsList();
    if (state.activePeerId === userId) {
      const status = state.peers[userId]?.dataChannel?.readyState === "open"
        ? "Connected"
        : state.onlineUsers.has(userId)
          ? "Online"
          : "Offline";
      updatePeerState(elements.chatSubtitle?.textContent || `Session with ${userId}`, status);
    }
  } finally {
    state.pendingProfileLoads.delete(userId);
  }
}

async function handlePrivateUserLookup() {
  const targetId = sanitizeId(elements.privateId?.value || "");
  if (!targetId) {
    clearPrivateSearchResult();
    return;
  }

  const response = await fetchJson(`/api/users/${encodeURIComponent(targetId)}`);
  if (!response.ok || !response.data) {
    if (elements.privateSearchResult) {
      elements.privateSearchResult.classList.remove("hidden");
      elements.privateSearchResult.innerHTML = `<div class="rounded-2xl border border-dashed border-glass-border p-4 text-sm text-mist">${response.error || "User not found."}</div>`;
    }
    return;
  }

  upsertKnownUser(response.data);
  renderPrivateSearchResult(response.data);
  renderInbox();
  renderPublicUsers();
  renderFriendsList();
}

async function renderInbox() {
  if (!window.Storage) return;
  const threads = await Storage.getThreads();
  if (!elements.threadList) return;
  
  elements.threadList.innerHTML = "";
  if (threads.length === 0) {
    elements.threadList.innerHTML = '<div class="text-center text-xs text-mist p-4">No conversations yet.<br>Find users in Discovery or Connect via ID.</div>';
    return;
  }
  
  threads.forEach((thread) => {
    const isOnline = state.onlineUsers.has(thread.peerId);
    const isActive = state.activePeerId === thread.peerId;
    const item = document.createElement("div");
    
    item.className = `relative flex w-full items-center justify-between rounded-2xl border border-glass-border p-3 cursor-pointer transition-all hover:bg-black/80 hover:shadow-glow group ${isActive ? "bg-black/60 border-glow" : "bg-black/40"}`;
    item.innerHTML = `
      <div class="flex items-center gap-3 w-full overflow-hidden">
        <div class="relative flex-shrink-0 h-10 w-10 rounded-full overflow-hidden shadow-glow">
          <img src="${getAvatarUrl(thread.peerId)}" alt="" class="h-full w-full object-cover" onerror="this.src='https://api.dicebear.com/9.x/initials/svg?seed=${thread.peerId}'" />
          <span class="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-obsidian ${isOnline ? "bg-neon-green" : "bg-zinc-600"}"></span>
        </div>
        <div class="flex-1 min-w-0 pr-6">
          <div class="flex justify-between items-center mb-1">
            <p class="text-sm font-bold uppercase tracking-wider ${isActive ? 'text-white' : 'text-zinc-200'} truncate flex items-center gap-2">
              ${getDisplayName(thread.peerId)} 
              ${thread.isPinned ? '<i class="ph-fill ph-push-pin text-glow text-xs"></i>' : ''}
            </p>
            <p class="text-[10px] text-mist flex-shrink-0 ml-2">${formatRelativeTime(thread.lastMessageTimestamp)}</p>
          </div>
          <p class="text-xs text-mist truncate">${thread.lastMessage || 'Start a conversation'}</p>
        </div>
        ${thread.unreadCount > 0 ? `<div class="absolute right-3 bottom-3 h-5 min-w-[20px] rounded-full bg-pulse flex items-center justify-center text-[10px] font-bold text-white px-1.5 shadow-[0_0_10px_rgba(251,113,133,0.5)]">${thread.unreadCount}</div>` : ''}
      </div>
      <!-- Pin Action -->
      <button class="pin-btn opacity-0 group-hover:opacity-100 absolute right-3 top-3 text-mist hover:text-glow transition-all focus:outline-none">
        <i class="${thread.isPinned ? 'ph-fill text-glow' : 'ph'} ph-push-pin"></i>
      </button>
    `;
    
    item.addEventListener("click", (e) => {
      if (e.target.closest('.pin-btn')) {
        e.stopPropagation();
        Storage.togglePin(thread.peerId).then(() => renderInbox());
        return;
      }
      selectThread(thread.peerId);
    });
    
    elements.threadList.appendChild(item);
  });
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const diff = (timestamp - Date.now()) / 1000;
  if (Math.abs(diff) < 60) return 'now';
  if (Math.abs(diff) < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (Math.abs(diff) < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return new Date(timestamp).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
}

async function selectThread(peerId) {
  state.activePeerId = peerId;
  showEmptyState(false);
  ensureUserProfile(peerId);
  
  // Mobile responsive layout toggle — only hide sidebar on small screens
  const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
  if (!isDesktop) {
    elements.inboxSidebar?.classList.add("-translate-x-full");
  }
  elements.chatPanel?.classList.remove("translate-x-full");
  
  // Clear unread
  if (window.Storage) {
    await Storage.clearUnread(peerId);
    renderInbox();
  }
  
  elements.messages.innerHTML = '';
  
  // Render messages
  if (window.Storage) {
    const msgs = await Storage.getMessages(peerId);
    msgs.forEach(m => {
      if (m.kind === 'file') {
        appendHistoricalFileMessage(m);
      } else if (m.kind === 'system') {
        appendSystemMessage(m.text);
      } else {
        renderMessageBubble(m);
      }
    });
  }
  
  elements.messages.scrollTop = elements.messages.scrollHeight;
  
  // Update UI state
  const isOnline = state.onlineUsers.has(peerId);
  const isConnected = state.peers[peerId]?.dataChannel?.readyState === "open";
  
  if (isConnected) {
    updatePeerState(`Session with ${peerId}: connected`, "Connected");
  } else if (isOnline) {
    updatePeerState(`Ready to connect`, "Online");
  } else {
    updatePeerState(`Peer is offline`, "Offline");
  }
  
  elements.messageInput.focus();
  
  // Auto connect if online but not connected
  if (isOnline && !isConnected) {
    connectToPeer(peerId, true);
  }
}

async function bootstrapSession() {
  try {
    const response = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    hydrateSession(data.user);
    await fetchNicknames();
    showAppShell();
    return true;
  } catch {
    return false;
  }
}

function hideAllAuthForms() {
  elements.registerForm.classList.add("hidden");
  elements.verifyForm.classList.add("hidden");
  elements.passwordForm.classList.add("hidden");
  elements.nameForm?.classList.add("hidden");
  elements.loginForm.classList.add("hidden");
  elements.forgotEmailForm.classList.add("hidden");
  elements.forgotOtpForm.classList.add("hidden");
}

function showAuthMode(mode) {
  const registerActive = mode === "register";
  elements.showRegister.className = registerActive
    ? "flex-1 rounded-xl bg-glow/20 text-glow px-4 py-3 text-sm font-bold transition"
    : "flex-1 rounded-xl px-4 py-3 text-sm font-bold text-mist hover:text-white transition";
  elements.showLogin.className = registerActive
    ? "flex-1 rounded-xl px-4 py-3 text-sm font-bold text-mist hover:text-white transition"
    : "flex-1 rounded-xl bg-glow/20 text-glow px-4 py-3 text-sm font-bold transition";
  hideAllAuthForms();
  if (registerActive) {
    elements.registerForm.classList.remove("hidden");
    if (state.authEmail) {
      elements.verifyForm.classList.remove("hidden");
      elements.passwordForm.classList.remove("hidden");
    }
  } else {
    elements.loginForm.classList.remove("hidden");
  }
  setAuthStatus("");
  resetValidationStyles();
}

function showForgotPasswordMode() {
  hideAllAuthForms();
  elements.showRegister.className = "flex-1 rounded-xl px-4 py-3 text-sm font-bold text-mist hover:text-white transition";
  elements.showLogin.className = "flex-1 rounded-xl px-4 py-3 text-sm font-bold text-mist hover:text-white transition";
  elements.forgotEmailForm.classList.remove("hidden");
  setAuthStatus("");
  resetValidationStyles();
}

function resetValidationStyles() {
  const inputs = [elements.registerEmail, elements.verifyOtp, elements.setPassword, elements.loginEmail, elements.loginPassword, elements.forgotEmail, elements.forgotOtp, elements.forgotNewPassword];
  inputs.forEach(input => {
    input.classList.remove("border-pulse", "border-neon-green");
  });
}

function setAuthStatus(message, tone = "muted") {
  if (!message) {
    elements.authStatusContainer.classList.add("hidden");
    return;
  }
  elements.authStatusContainer.classList.remove("hidden");
  const tones = {
    muted: "text-mist border-glass-border bg-black/40",
    error: "text-pulse border-pulse/50 bg-pulse/10",
    success: "text-neon-green border-neon-green/50 bg-neon-green/10",
  };
  elements.authStatusContainer.className = `mt-6 rounded-2xl p-4 border transition-all duration-300 ${tones[tone] || tones.muted}`;
  elements.authStatus.textContent = message;
}

function applyValidationClass(input, isValid) {
  input.classList.remove("border-pulse", "border-neon-green");
  input.classList.add(isValid ? "border-neon-green" : "border-pulse");
}

async function handleRegister(event) {
  event.preventDefault();
  const email = elements.registerEmail.value.trim().toLowerCase();
  const response = await fetchJson("/register", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    applyValidationClass(elements.registerEmail, false);
    setAuthStatus(response.error, "error");
    return;
  }
  applyValidationClass(elements.registerEmail, true);
  state.authEmail = email;
  elements.registerForm.classList.add("hidden");
  elements.verifyForm.classList.remove("hidden");
  setAuthStatus("Verification code sent to your email.", "success");
}

async function handleVerify(event) {
  event.preventDefault();
  const response = await fetchJson("/verify", {
    method: "POST",
    body: JSON.stringify({
      email: state.authEmail || elements.registerEmail.value.trim().toLowerCase(),
      otp: elements.verifyOtp.value.trim(),
    }),
  });
  if (!response.ok) {
    applyValidationClass(elements.verifyOtp, false);
    setAuthStatus(response.error, "error");
    return;
  }
  applyValidationClass(elements.verifyOtp, true);
  elements.verifyForm.classList.add("hidden");
  elements.passwordForm.classList.remove("hidden");
  setAuthStatus("Code verified. Create your master password.", "success");
}

async function handleSetPassword(event) {
  event.preventDefault();
  const response = await fetchJson("/set-password", {
    method: "POST",
    body: JSON.stringify({
      email: state.authEmail || elements.registerEmail.value.trim().toLowerCase(),
      password: elements.setPassword.value,
    }),
  });
  if (!response.ok) {
    applyValidationClass(elements.setPassword, false);
    setAuthStatus(response.error, "error");
    return;
  }
  applyValidationClass(elements.setPassword, true);
  setAuthStatus("");
  elements.passwordForm.classList.add("hidden");
  elements.nameForm.classList.remove("hidden");
  setAuthStatus("Password set. Now enter your name.", "success");
}

async function handleSetName(event) {
  event.preventDefault();
  const response = await fetchJson("/set-name", {
    method: "POST",
    body: JSON.stringify({
      email: state.authEmail || elements.registerEmail.value.trim().toLowerCase(),
      first_name: elements.firstName.value.trim(),
      last_name: elements.lastName.value.trim(),
    }),
  });
  if (!response.ok) {
    applyValidationClass(elements.firstName, false);
    applyValidationClass(elements.lastName, false);
    setAuthStatus(response.error, "error");
    return;
  }
  applyValidationClass(elements.firstName, true);
  applyValidationClass(elements.lastName, true);
  setAuthStatus("");
  elements.authFormsContainer.classList.add("hidden");
  elements.authConfirmation.classList.remove("hidden");
  elements.authConfirmation.classList.add("flex");
  document.getElementById("confirm-title").textContent = "Account Secured";
  document.getElementById("confirm-msg").textContent = `Your permanent ID is ${response.data.id}`;
}

async function handleLogin(event) {
  event.preventDefault();
  const response = await fetchJson("/login", {
    method: "POST",
    body: JSON.stringify({
      email: elements.loginEmail.value.trim().toLowerCase(),
      password: elements.loginPassword.value,
    }),
  });
  if (!response.ok) {
    applyValidationClass(elements.loginEmail, false);
    applyValidationClass(elements.loginPassword, false);
    setAuthStatus(response.error, "error");
    return;
  }
  applyValidationClass(elements.loginEmail, true);
  applyValidationClass(elements.loginPassword, true);
  hydrateSession(response.data.user);
  showAppShell();
}

async function handleForgotPassword(event) {
  event.preventDefault();
  const email = elements.forgotEmail.value.trim().toLowerCase();
  const response = await fetchJson("/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    applyValidationClass(elements.forgotEmail, false);
    setAuthStatus(response.error, "error");
    return;
  }
  applyValidationClass(elements.forgotEmail, true);
  state.authEmail = email;
  elements.forgotEmailForm.classList.add("hidden");
  elements.forgotOtpForm.classList.remove("hidden");
  setAuthStatus("Reset code sent to your email.", "success");
}

async function handleResetPassword(event) {
  event.preventDefault();
  const otp = elements.forgotOtp.value.trim();
  const newPassword = elements.forgotNewPassword.value;
  const response = await fetchJson("/reset-password", {
    method: "POST",
    body: JSON.stringify({
      email: state.authEmail,
      otp,
      new_password: newPassword,
    }),
  });
  if (!response.ok) {
    applyValidationClass(elements.forgotOtp, false);
    applyValidationClass(elements.forgotNewPassword, false);
    setAuthStatus(response.error, "error");
    return;
  }
  applyValidationClass(elements.forgotOtp, true);
  applyValidationClass(elements.forgotNewPassword, true);
  setAuthStatus("");
  elements.authFormsContainer.classList.add("hidden");
  elements.authConfirmation.classList.remove("hidden");
  elements.authConfirmation.classList.add("flex");
  document.getElementById("confirm-title").textContent = "Password Reset";
  document.getElementById("confirm-msg").textContent = "Your password has been reset successfully. You can now log in with your new password.";
}

function hydrateSession(user) {
  state.myId = user.id;
  state.myEmail = user.email;
  state.isPublic = user.is_public;
  if (user.avatar_url) state.avatarCache[user.id] = user.avatar_url;
  elements.myId.textContent = state.myId;
  elements.myEmail.textContent = state.myEmail;
  if (elements.myAvatar) {
    elements.myAvatar.src = getAvatarUrl(state.myId);
    elements.myAvatar.onerror = function() { this.src = `https://api.dicebear.com/9.x/initials/svg?seed=${state.myId}`; };
  }
  if (elements.publicToggle) {
    elements.publicToggle.checked = state.isPublic;
  }
  if (window.Storage) {
    Storage.init(state.myId);
  }
}

function showAppShell() {
  elements.authShell.classList.add("hidden");
  elements.appShell.classList.remove("hidden");
  showEmptyState(true);
  refreshPublicUsers();
  connectSignaling();
  renderInbox();
  fetchFriendsList();
}

async function logout() {
  await fetch("/logout", { method: "POST", credentials: "same-origin" });
  const socket = state.signalingSocket;
  state.signalingSocket = null;
  state.myId = null;
  state.myEmail = null;
  state.pendingProfileLoads.clear();
  
  // Close all peer connections
  Object.keys(state.peers).forEach(peerId => resetConnection(peerId));
  state.peers = {};
  state.activePeerId = null;
  
  if (socket) socket.close();
  state.isPublic = false;
  state.publicUsers = [];
  state.onlineUsers.clear();
  if (elements.publicUsers) elements.publicUsers.innerHTML = "";
  elements.myId.textContent = "------";
  elements.myEmail.textContent = "-";
  elements.authShell.classList.remove("hidden");
  elements.appShell.classList.add("hidden");
  showAuthMode("login");
}

function connectSignaling() {
  if (!state.myId) return;
  if (state.signalingSocket && state.signalingSocket.readyState <= WebSocket.OPEN) return;

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  state.signalingSocket = new WebSocket(`${protocol}://${window.location.host}/ws/${state.myId}`);

  state.signalingSocket.addEventListener("open", () => {
    elements.wsStatus.textContent = "Signaling server connected.";
  });

  state.signalingSocket.addEventListener("message", async (event) => {
    const message = JSON.parse(event.data);
    await handleSignal(message);
  });

  state.signalingSocket.addEventListener("close", () => {
    elements.wsStatus.textContent = "Signaling disconnected. Retrying...";
    if (state.myId) {
      setTimeout(connectSignaling, 2000);
    }
  });
}

async function handleSignal(message) {
  const { type, from, payload } = message;
  
  if (type === "presence-snapshot") {
    state.onlineUsers = new Set(message.online || []);
    Array.from(state.onlineUsers).forEach((userId) => {
      ensureUserProfile(userId);
    });
    renderPublicUsers();
    renderInbox();
    renderFriendsList();
    if (state.activePeerId) selectThread(state.activePeerId); // update status
    return;
  }
  
  if (type === "presence") {
    if (message.status === "connected") {
      state.onlineUsers.add(message.clientId);
      ensureUserProfile(message.clientId);
    } else {
      state.onlineUsers.delete(message.clientId);
      if (state.activePeerId === message.clientId) {
        await logSystemMessage(message.clientId, `${message.clientId} went offline.`);
        updatePeerState(`Peer is offline`, "Offline");
      }
    }
    renderPublicUsers();
    renderInbox();
    renderFriendsList();
    return;
  }
  
  if (type === "friend-request") {
    ensureUserProfile(message.from);
    showToast(`New friend request from ${message.from}`);
    elements.requestsBadge?.classList.remove("hidden");
    refreshPublicUsers();
    return;
  }
  
  if (type === "friend-accepted") {
    ensureUserProfile(message.from);
    showToast(`${message.from} accepted your friend request!`);
    refreshPublicUsers();
    fetchFriendsList();
    return;
  }

  if (type === "peer-unavailable") {
    if (state.activePeerId === message.target) {
      await logSystemMessage(message.target, `${message.target} is offline right now.`);
    }
    return;
  }

  // Ensure peer context exists
  ensureUserProfile(from);
  if (!state.peers[from]) {
    state.peers[from] = createPeerContext();
  }
  const peer = state.peers[from];

  if (type === "offer") {
    // If not initiator, we might not have called connectToPeer yet.
    if (!peer.peerConnection) {
      peer.ecdhKeyPair = await generateKeyPair();
      peer.peerConnection = new RTCPeerConnection(config.rtc);
      setupPeerConnectionListeners(from, peer);
    }
    
    await peer.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    peer.cryptoKey = await processRemotePublicKey(payload.publicKey, peer.ecdhKeyPair.privateKey);
    
    for (const candidate of peer.pendingCandidates) {
      await peer.peerConnection.addIceCandidate(candidate);
    }
    peer.pendingCandidates = [];
    
    const answer = await peer.peerConnection.createAnswer();
    await peer.peerConnection.setLocalDescription(answer);
    
    sendSignal("answer", from, {
      sdp: answer,
      publicKey: await exportPublicKey(peer.ecdhKeyPair.publicKey),
    });
    return;
  }
  
  if (type === "answer" && peer.peerConnection) {
    await peer.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    peer.cryptoKey = await processRemotePublicKey(payload.publicKey, peer.ecdhKeyPair.privateKey);
    return;
  }
  
  if (type === "ice-candidate") {
    const candidate = new RTCIceCandidate(payload.candidate);
    if (peer.peerConnection?.remoteDescription) {
      await peer.peerConnection.addIceCandidate(candidate);
    } else {
      peer.pendingCandidates.push(candidate);
    }
  }
}

function sendSignal(type, target, payload) {
  if (!state.signalingSocket || state.signalingSocket.readyState !== WebSocket.OPEN) {
    if (state.activePeerId === target) appendSystemMessage("Signaling server is not ready yet.");
    return;
  }
  state.signalingSocket.send(JSON.stringify({ type, target, payload }));
}

async function updateVisibility() {
  state.isPublic = elements.publicToggle.checked;
  await fetch(`/api/users/${state.myId}/visibility`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ is_public: state.isPublic }),
  });
  await refreshPublicUsers();
}

async function refreshPublicUsers() {
  if (!state.myId) return;
  const response = await fetch("/api/users/public", { credentials: "same-origin" });
  if (!response.ok) return;
  const data = await response.json();
  state.publicUsers.forEach((user) => {
    if (user.id !== state.myId) {
      user.is_public = false;
    }
  });
  (data.users || []).forEach((user) => upsertKnownUser(user));
  renderPublicUsers();
}

function renderPublicUsers() {
  if (!elements.publicUsers) return;
  elements.publicUsers.innerHTML = "";
  const visibleUsers = state.publicUsers.filter((user) => user.id !== state.myId && user.is_public);
  if (!visibleUsers.length) {
    elements.publicUsers.innerHTML = '<div class="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-mist">No public users available yet.</div>';
    return;
  }

  visibleUsers.forEach((user) => {
    const isOnline = state.onlineUsers.has(user.id);
    const item = document.createElement("div");
    item.className = "flex w-full items-center justify-between rounded-2xl border border-glass-border bg-black/40 px-4 py-4 transition-all group hover:border-glow hover:bg-black/80 hover:shadow-glow";
    
    // Determine button state based on relation_status
    let buttonHtml = '';
    if (user.relation_status === "friends") {
      buttonHtml = `<button class="action-btn px-3 py-1.5 rounded-xl bg-glass-surface border border-glass-border text-xs font-bold text-glow hover:bg-white/10 transition-colors flex items-center gap-1"><i class="ph-bold ph-chat-teardrop-dots"></i> Message</button>`;
    } else if (user.relation_status === "requested") {
      buttonHtml = `<button disabled class="px-3 py-1.5 rounded-xl bg-black/50 border border-glass-border text-xs font-bold text-mist cursor-not-allowed flex items-center gap-1"><i class="ph-bold ph-clock"></i> Requested</button>`;
    } else if (user.relation_status === "pending_incoming") {
       buttonHtml = `<button class="accept-btn px-3 py-1.5 rounded-xl bg-glow/20 border border-glow text-xs font-bold text-glow hover:bg-glow/40 transition-colors flex items-center gap-1"><i class="ph-bold ph-check"></i> Accept</button>`;
    } else {
      buttonHtml = `<button class="add-friend-btn px-3 py-1.5 rounded-xl bg-white/5 border border-glass-border text-xs font-bold text-mist hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1"><i class="ph-bold ph-user-plus"></i> Add Friend</button>`;
    }

    item.innerHTML = `
      <div class="flex items-center gap-3 cursor-pointer select-target-area">
        <div class="relative flex-shrink-0 h-10 w-10 rounded-full overflow-hidden shadow-glow">
          <img src="${getAvatarUrl(user.id)}" alt="" class="h-full w-full object-cover" onerror="this.src='https://api.dicebear.com/9.x/initials/svg?seed=${user.id}'" />
          <span class="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-obsidian ${isOnline ? "bg-neon-green shadow-green-glow" : "bg-zinc-600"}"></span>
        </div>
        <div>
          <p class="text-sm font-bold uppercase tracking-wider text-glow">${getDisplayName(user.id)}</p>
          <p class="mt-1 text-[10px] text-mist">${isOnline ? "Ready for connection" : "Offline"}</p>
        </div>
      </div>
      <div class="action-container z-10 relative">
        ${buttonHtml}
      </div>
    `;
    
    // Add event listeners
    const actionContainer = item.querySelector('.action-container');
    const actionBtn = actionContainer.querySelector('.action-btn');
    const addBtn = actionContainer.querySelector('.add-friend-btn');
    const acceptBtn = actionContainer.querySelector('.accept-btn');
    const selectArea = item.querySelector('.select-target-area');
    
    const connectHandler = () => {
      elements.discoveryPanel?.classList.add("hidden");
      connectToPeer(user.id, true);
    };

    if (actionBtn) {
      actionBtn.addEventListener("click", connectHandler);
      selectArea.addEventListener("click", connectHandler);
    }
    
    if (addBtn) {
      addBtn.addEventListener("click", () => sendFriendRequest(user.id));
    }

    if (acceptBtn) {
      acceptBtn.addEventListener("click", () => {
        elements.requestsModal?.classList.remove("hidden");
        elements.requestsModal?.classList.add("flex");
        fetchFriendRequests();
      });
    }

    elements.publicUsers.appendChild(item);
  });
}

function createPeerContext() {
  return {
    peerConnection: null,
    dataChannel: null,
    cryptoKey: null,
    ecdhKeyPair: null,
    pendingCandidates: [],
    fileTransfers: new Map(),
    typingTimeout: null,
    remoteTypingTimeout: null,
  };
}

async function connectToPeer(targetId, initiator) {
  ensureUserProfile(targetId);
  // If we already have a connection opening/open, just select the thread
  if (state.peers[targetId]?.peerConnection) {
    selectThread(targetId);
    return;
  }

  if (!state.peers[targetId]) {
    state.peers[targetId] = createPeerContext();
  }
  const peer = state.peers[targetId];

  // If initiating, auto-select this thread so UI updates
  if (initiator) {
    selectThread(targetId);
    updatePeerState(`Connecting to ${targetId}`, "Connecting");
  }

  peer.ecdhKeyPair = await generateKeyPair();
  peer.peerConnection = new RTCPeerConnection(config.rtc);
  setupPeerConnectionListeners(targetId, peer);

  if (initiator) {
    const channel = peer.peerConnection.createDataChannel("secure-chat");
    setupDataChannel(channel, targetId, peer);
    const offer = await peer.peerConnection.createOffer();
    await peer.peerConnection.setLocalDescription(offer);
    sendSignal("offer", targetId, {
      sdp: offer,
      publicKey: await exportPublicKey(peer.ecdhKeyPair.publicKey),
    });
  }
}

function setupPeerConnectionListeners(peerId, peer) {
  peer.peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal("ice-candidate", peerId, { candidate: event.candidate });
    }
  };
  peer.peerConnection.onconnectionstatechange = () => {
    const connectionState = peer.peerConnection?.connectionState ?? "disconnected";
    if (state.activePeerId === peerId) {
      updatePeerState(`Session with ${peerId}: ${connectionState}`, connectionState);
    }
  };
  peer.peerConnection.ondatachannel = (event) => {
    setupDataChannel(event.channel, peerId, peer);
  };
}

function setupDataChannel(channel, peerId, peer) {
  peer.dataChannel = channel;
  peer.dataChannel.binaryType = "arraybuffer";

  peer.dataChannel.onopen = async () => {
    if (state.activePeerId === peerId) {
      updatePeerState(`Secure channel with ${peerId}`, "Connected");
    }
    await logSystemMessage(peerId, `Connected to ${peerId}. Messages are E2EE.`);
  };

  peer.dataChannel.onclose = () => {
    if (state.activePeerId === peerId) {
      updatePeerState("Connection lost", "Disconnected");
      clearRemoteTyping(peer);
    }
  };

  peer.dataChannel.onmessage = async (event) => {
    const packet = JSON.parse(event.data);
    await handleIncomingPacket(packet, peerId, peer);
  };
}

async function sendMessage() {
  const peerId = state.activePeerId;
  if (!peerId) return;
  const peer = state.peers[peerId];
  const text = elements.messageInput.value.trim();
  
  if (!text) return;
  
  if (!channelReady(peerId)) {
    // Offline message? Wait for now just drop or tell user
    appendSystemMessage("Cannot send: Not connected. Please wait to connect.");
    return;
  }

  const expiresInMs = Number(elements.expirySelect?.value || "0");
  const sentAt = Date.now();
  
  const payloadObj = { kind: "text", text, expiresInMs, sentAt, id: crypto.randomUUID() };
  const encrypted = await encryptPayload(payloadObj, peer.cryptoKey);
  
  peer.dataChannel.send(JSON.stringify({ type: "encrypted", payload: encrypted }));
  
  const localMsg = { id: payloadObj.id, direction: "outgoing", text, expiresInMs, sentAt, kind: "text" };
  
  // Save to IndexedDB
  if (window.Storage) {
    await Storage.appendMessage(peerId, localMsg);
    renderInbox(); // update sidebar snippet
  }
  
  renderMessageBubble(localMsg);
  elements.messageInput.value = "";
  emitTypingStop();
}

async function sendFile(file) {
  const peerId = state.activePeerId;
  if (!peerId) return;
  const peer = state.peers[peerId];
  
  if (!channelReady(peerId)) return;

  const buffer = await file.arrayBuffer();
  const bytes = Array.from(new Uint8Array(buffer));
  const transferId = crypto.randomUUID();
  const sentAt = Date.now();
  
  const payloadObj = {
    kind: "file",
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    bytes,
    sentAt,
    id: crypto.randomUUID()
  };
  
  const encrypted = await encryptPayload(payloadObj, peer.cryptoKey);
  const serialized = JSON.stringify({ type: "encrypted", payload: encrypted });
  
  for (let offset = 0; offset < serialized.length; offset += config.chunkSize) {
    const chunk = serialized.slice(offset, offset + config.chunkSize);
    peer.dataChannel.send(
      JSON.stringify({
        type: "file-chunk",
        transferId,
        chunk,
        done: offset + config.chunkSize >= serialized.length,
      }),
    );
  }

  const localMsg = { id: payloadObj.id, direction: "outgoing", name: file.name, sentAt, kind: "file" };
  
  if (window.Storage) {
    await Storage.appendMessage(peerId, localMsg);
    renderInbox();
  }
  
  appendSystemMessage(`Sent encrypted file: ${file.name}`);
}

async function handleIncomingPacket(packet, peerId, peer) {
  if (packet.type === "typing-start") {
    if (state.activePeerId === peerId) showRemoteTyping(peer);
    return;
  }

  if (packet.type === "typing-stop") {
    if (state.activePeerId === peerId) clearRemoteTyping(peer);
    return;
  }

  if (packet.type === "file-chunk") {
    const existing = peer.fileTransfers.get(packet.transferId) || [];
    existing.push(packet.chunk);
    peer.fileTransfers.set(packet.transferId, existing);
    if (packet.done) {
      const completed = existing.join("");
      peer.fileTransfers.delete(packet.transferId);
      const envelope = JSON.parse(completed);
      await handleIncomingPacket(envelope, peerId, peer);
    }
    return;
  }

  if (packet.type !== "encrypted") {
    return;
  }

  const decrypted = await decryptPayload(packet.payload, peer.cryptoKey);
  
  if (decrypted.kind === "text" || decrypted.kind === "gif" || decrypted.kind === "sticker") {
    const msg = {
      id: decrypted.id || crypto.randomUUID(),
      text: decrypted.text,
      url: decrypted.url,
      direction: "incoming",
      expiresInMs: Number(decrypted.expiresInMs || 0),
      sentAt: Number(decrypted.sentAt || Date.now()),
      kind: decrypted.kind
    };
    
    if (window.Storage) {
      await Storage.appendMessage(peerId, msg);
      if (state.activePeerId !== peerId) {
        await Storage.incrementUnread(peerId);
      }
      renderInbox();
    }
    
    if (state.activePeerId === peerId) {
      renderMessageBubble(msg);
    }
    return;
  }

  if (decrypted.kind === "file") {
    const byteArray = new Uint8Array(decrypted.bytes);
    const blob = new Blob([byteArray], { type: decrypted.mime });
    const url = URL.createObjectURL(blob);
    
    const msg = {
      id: decrypted.id || crypto.randomUUID(),
      name: decrypted.name,
      direction: "incoming",
      sentAt: Number(decrypted.sentAt || Date.now()),
      kind: "file",
      // Note: ObjectURLs are non-persistent, so historical viewing won't work across refresh.
    };
    
    if (window.Storage) {
      await Storage.appendMessage(peerId, msg);
      if (state.activePeerId !== peerId) {
        await Storage.incrementUnread(peerId);
      }
      renderInbox();
    }
    
    if (state.activePeerId === peerId) {
      appendFileMessage(decrypted.name, url, "incoming");
    }
  }
}

function renderMessageBubble(m) {
  const wrapper = elements.messageTemplate.content.firstElementChild.cloneNode(true);
  wrapper.dataset.messageId = m.id;
  wrapper.classList.add(m.direction === "outgoing" ? "ml-auto" : "mr-auto");
  
  const bubble = wrapper.querySelector(".message-bubble");
  const avatar = wrapper.querySelector(".message-avatar");

  if (m.direction === "outgoing") {
    bubble.classList.add("bg-glow", "text-black", "font-medium");
    bubble.classList.remove("border-glass-border");
    wrapper.classList.add("flex-row-reverse");
  } else {
    bubble.classList.add("bg-black/40", "text-white");
    avatar.classList.remove("hidden");
    avatar.src = getAvatarUrl(state.activePeerId);
    avatar.onerror = function() { this.src = `https://api.dicebear.com/9.x/initials/svg?seed=${state.activePeerId}`; };
  }

  if (m.kind === "text") {
    bubble.textContent = m.text;
  } else if (m.kind === "gif" || m.kind === "sticker") {
    bubble.innerHTML = `<img src="${m.url}" class="rounded-xl max-w-full h-auto max-h-48" />`;
    bubble.classList.replace("px-4", "px-2");
    bubble.classList.replace("py-3", "py-2");
    bubble.classList.replace("bg-glow", "bg-transparent");
    bubble.classList.replace("bg-black/40", "bg-transparent");
    bubble.classList.remove("shadow-glass", "border");
  }

  elements.messages.appendChild(wrapper);
  elements.messages.scrollTop = elements.messages.scrollHeight;

  if (m.expiresInMs > 0) {
    scheduleExpiry(m.id, m.sentAt + m.expiresInMs, state.activePeerId);
  }
}

function scheduleExpiry(messageId, expiresAt, peerId) {
  const delay = Math.max(0, expiresAt - Date.now());
  setTimeout(async () => {
    if (window.Storage) {
      await Storage.removeMessage(peerId, messageId);
    }
    if (state.activePeerId === peerId) {
      const node = elements.messages.querySelector(`[data-message-id="${messageId}"]`);
      if (node) node.remove();
    }
  }, delay);
}

function appendHistoricalFileMessage(m) {
  // Mock display for old files since object URLs expire
  const wrapper = elements.messageTemplate.content.firstElementChild.cloneNode(true);
  wrapper.classList.add(m.direction === "outgoing" ? "ml-auto" : "mr-auto");
  if (m.direction === "outgoing") {
    wrapper.classList.add("flex-row-reverse");
  } else {
    const avatar = wrapper.querySelector(".message-avatar");
    avatar.classList.remove("hidden");
    avatar.src = getAvatarUrl(state.activePeerId);
    avatar.onerror = function() { this.src = `https://api.dicebear.com/9.x/initials/svg?seed=${state.activePeerId}`; };
  }
  
  const bubble = wrapper.querySelector(".message-bubble");
  bubble.classList.add("bg-black/40", "text-mist", "italic");
  bubble.innerHTML = `<i class="ph-bold ph-file-zip mr-2"></i> File: ${m.name || "Unknown"} (Link expired)`;
  elements.messages.appendChild(wrapper);
}

function appendFileMessage(name, url, direction) {
  const wrapper = elements.messageTemplate.content.firstElementChild.cloneNode(true);
  wrapper.classList.add(direction === "outgoing" ? "ml-auto" : "mr-auto");
  
  if (direction === "outgoing") {
    wrapper.classList.add("flex-row-reverse");
  } else {
    const avatar = wrapper.querySelector(".message-avatar");
    avatar.classList.remove("hidden");
    avatar.src = getAvatarUrl(state.activePeerId);
    avatar.onerror = function() { this.src = `https://api.dicebear.com/9.x/initials/svg?seed=${state.activePeerId}`; };
  }
  
  const bubble = wrapper.querySelector(".message-bubble");
  bubble.classList.add("bg-black/40", "text-white", "flex", "items-center");
  
  const icon = document.createElement("i");
  icon.className = "ph-fill ph-file-zip text-2xl text-glow mr-3";
  
  const contentDiv = document.createElement("div");
  contentDiv.className = "flex flex-col";
  
  const title = document.createElement("span");
  title.textContent = "Encrypted file received";
  title.className = "text-xs text-mist font-bold uppercase tracking-wider mb-1";
  
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.textContent = name;
  link.className = "text-glow hover:text-white transition-colors underline font-medium truncate max-w-[200px]";
  
  contentDiv.appendChild(title);
  contentDiv.appendChild(link);
  
  bubble.innerHTML = "";
  bubble.appendChild(icon);
  bubble.appendChild(contentDiv);
  
  elements.messages.appendChild(wrapper);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

async function logSystemMessage(peerId, text) {
  const msgObj = { id: crypto.randomUUID(), direction: "system", text, sentAt: Date.now(), kind: "system" };
  if (window.Storage) {
    await Storage.appendMessage(peerId, msgObj);
    renderInbox();
  }
  if (state.activePeerId === peerId) {
    appendSystemMessage(text);
  }
}

function appendSystemMessage(text) {
  const entry = document.createElement("div");
  entry.className = "mx-auto w-fit text-center text-[10px] font-bold uppercase tracking-[0.2em] text-mist bg-black/40 px-3 py-1 rounded-full border border-glass-border backdrop-blur-md animate-pop-in mt-2 mb-2";
  entry.textContent = text;
  elements.messages.appendChild(entry);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function updatePeerState(subtitle, status) {
  if (elements.chatSubtitle) elements.chatSubtitle.textContent = subtitle;
  if (elements.chatHeaderName) {
    elements.chatHeaderName.textContent = state.activePeerId ? getDisplayName(state.activePeerId) : "Disconnected";
    if (state.activePeerId) {
      elements.editNicknameBtn?.classList.remove("hidden");
    } else {
      elements.editNicknameBtn?.classList.add("hidden");
    }
  }
  if (elements.chatHeaderAvatarImg) {
    if (state.activePeerId) {
      elements.chatHeaderAvatarImg.src = getAvatarUrl(state.activePeerId);
    } else {
      elements.chatHeaderAvatarImg.src = `https://api.dicebear.com/9.x/initials/svg?seed=NA`;
    }
  }
  if (elements.chatHeaderDot) {
    if (status === "Connected") {
      elements.chatHeaderDot.className = "h-2 w-2 rounded-full bg-neon-green shadow-green-glow";
    } else if (status === "Online") {
      elements.chatHeaderDot.className = "h-2 w-2 rounded-full bg-glow shadow-glow";
    } else {
      elements.chatHeaderDot.className = "h-2 w-2 rounded-full bg-mist";
    }
  }
}

function channelReady(peerId) {
  const peer = state.peers[peerId];
  return peer && peer.dataChannel && peer.dataChannel.readyState === "open" && peer.cryptoKey;
}

function resetConnection(peerId) {
  const peer = state.peers[peerId];
  if (!peer) return;
  
  clearRemoteTyping(peer);
  clearTimeout(peer.typingTimeout);
  if (peer.dataChannel) peer.dataChannel.close();
  if (peer.peerConnection) peer.peerConnection.close();
  
  delete state.peers[peerId];
  
  if (state.activePeerId === peerId) {
    updatePeerState("Session closed.", "Disconnected");
  }
}

function emitTypingStart() {
  const peerId = state.activePeerId;
  if (!peerId || !channelReady(peerId)) return;
  const peer = state.peers[peerId];
  
  peer.dataChannel.send(JSON.stringify({ type: "typing-start" }));
  clearTimeout(peer.typingTimeout);
  peer.typingTimeout = setTimeout(emitTypingStop, config.typingStopDelayMs);
}

function emitTypingStop() {
  const peerId = state.activePeerId;
  if (!peerId) return;
  const peer = state.peers[peerId];
  
  clearTimeout(peer?.typingTimeout);
  if (peer) peer.typingTimeout = null;
  if (channelReady(peerId)) {
    peer.dataChannel.send(JSON.stringify({ type: "typing-stop" }));
  }
}

function showRemoteTyping(peer) {
  elements.typingIndicator?.classList.remove("hidden");
  elements.typingIndicator?.classList.add("flex");
  clearTimeout(peer.remoteTypingTimeout);
  peer.remoteTypingTimeout = setTimeout(() => clearRemoteTyping(peer), config.typingStopDelayMs + 300);
}

function clearRemoteTyping(peer) {
  elements.typingIndicator?.classList.add("hidden");
  elements.typingIndicator?.classList.remove("flex");
  clearTimeout(peer?.remoteTypingTimeout);
  if(peer) peer.remoteTypingTimeout = null;
}

async function generateKeyPair() {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );
}

async function exportPublicKey(publicKey) {
  return crypto.subtle.exportKey("jwk", publicKey);
}

async function processRemotePublicKey(remotePublicKeyJwk, privateKey) {
  const remotePublicKey = await crypto.subtle.importKey(
    "jwk",
    remotePublicKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );

  return await crypto.subtle.deriveKey(
    { name: "ECDH", public: remotePublicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptPayload(payload, cryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, encoded);
  return {
    iv: arrayBufferToBase64(iv.buffer),
    data: arrayBufferToBase64(encrypted),
  };
}

async function decryptPayload(payload, cryptoKey) {
  const iv = base64ToUint8Array(payload.iv);
  const data = base64ToUint8Array(payload.data);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, data);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

function openQrModal() {
  elements.qrModal?.classList.remove("hidden");
  elements.qrModal?.classList.add("flex");
  if(elements.qrIdLabel) elements.qrIdLabel.textContent = state.myId;
  if(elements.qrCode) {
    elements.qrCode.innerHTML = "";
    state.qrCode = new QRCode(elements.qrCode, {
      text: state.myId,
      width: 220,
      height: 220,
      colorDark: "#07111F",
      colorLight: "#FFFFFF",
    });
  }
}

function closeQrModal() {
  elements.qrModal?.classList.add("hidden");
  elements.qrModal?.classList.remove("flex");
}

function sanitizeId(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function fetchJson(url, options = {}) {
  try {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      data,
      error: data.detail || data.message || "Request failed.",
    };
  } catch {
    return {
      ok: false,
      data: null,
      error: "Network request failed.",
    };
  }
}

// ==========================================
// Friend Requests API & UI logic
// ==========================================

async function sendFriendRequest(receiverId) {
  const response = await fetchJson("/api/friends/request", {
    method: "POST",
    body: JSON.stringify({ receiver_id: receiverId }),
  });
  if (response.ok) {
    showToast(`Friend request sent to ${receiverId}`);
    refreshPublicUsers();
  } else {
    showToast(response.error || "Failed to send request", true);
  }
}

async function fetchFriendRequests() {
  const response = await fetchJson("/api/friends/requests");
  if (response.ok && response.data) {
    const requests = response.data.requests || [];
    // Cache avatar URLs from friend requests
    requests.forEach(r => { if (r.sender_avatar_url) state.avatarCache[r.sender_id] = r.sender_avatar_url; });
    renderRequestsModal(requests);
    if (requests.length === 0) {
      elements.requestsBadge?.classList.add("hidden");
    } else {
      elements.requestsBadge?.classList.remove("hidden");
    }
  }
}

async function acceptFriendRequest(requestId) {
  const response = await fetchJson(`/api/friends/${requestId}/accept`, { method: "PATCH" });
  if (response.ok) {
    showToast("Friend request accepted!");
    fetchFriendRequests();
    refreshPublicUsers();
  } else {
    showToast(response.error || "Failed to accept request", true);
  }
}

async function rejectFriendRequest(requestId) {
  const response = await fetchJson(`/api/friends/${requestId}/reject`, { method: "PATCH" });
  if (response.ok) {
    showToast("Friend request rejected");
    fetchFriendRequests();
    refreshPublicUsers();
  } else {
    showToast(response.error || "Failed to reject request", true);
  }
}

function renderRequestsModal(requests) {
  if (!elements.requestsList) return;
  elements.requestsList.innerHTML = "";
  if (!requests.length) {
    elements.requestsList.innerHTML = '<div class="text-center text-sm text-mist p-6 border border-dashed border-glass-border rounded-2xl">No pending requests</div>';
    return;
  }

  requests.forEach(req => {
    const item = document.createElement("div");
    item.className = "flex items-center justify-between p-4 rounded-2xl bg-black/40 border border-glass-border animate-pop-in";
    item.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 rounded-full overflow-hidden border border-glass-border flex-shrink-0">
          <img src="${req.sender_avatar_url || getAvatarUrl(req.sender_id)}" alt="" class="h-full w-full object-cover" onerror="this.src='https://api.dicebear.com/9.x/initials/svg?seed=${req.sender_id}'" />
        </div>
        <div>
          <p class="text-sm font-bold text-white uppercase tracking-wider">${req.sender_display_name || req.sender_id}</p>
          <p class="text-[10px] text-mist">Wants to connect</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button class="accept-req-btn p-2 rounded-xl bg-glow/20 text-glow hover:bg-glow/40 transition-colors" title="Accept">
          <i class="ph-bold ph-check"></i>
        </button>
        <button class="reject-req-btn p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors" title="Reject">
          <i class="ph-bold ph-x"></i>
        </button>
      </div>
    `;

    item.querySelector('.accept-req-btn').addEventListener("click", () => acceptFriendRequest(req.id));
    item.querySelector('.reject-req-btn').addEventListener("click", () => rejectFriendRequest(req.id));

    elements.requestsList.appendChild(item);
  });
}

function showToast(message, isError = false) {
  if (!elements.toastContainer) return;
  const toast = document.createElement("div");
  toast.className = `flex items-center gap-3 px-5 py-3 rounded-2xl shadow-glass border animate-slide-up bg-obsidian backdrop-blur-md pointer-events-auto ${isError ? 'border-red-500/50 text-red-200' : 'border-glow/50 text-white'}`;
  toast.innerHTML = `
    <i class="ph-bold ${isError ? 'ph-warning-circle text-red-400' : 'ph-info text-glow'} text-lg"></i>
    <p class="text-sm font-medium">${message}</p>
  `;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==========================================
// Sidebar Tabs & Friends List
// ==========================================

function switchSidebarTab(tab) {
  if (tab === "chats") {
    elements.sidebarTabChats?.classList.add("bg-glow/20", "text-glow");
    elements.sidebarTabChats?.classList.remove("text-mist");
    elements.sidebarTabFriends?.classList.remove("bg-glow/20", "text-glow");
    elements.sidebarTabFriends?.classList.add("text-mist");
    elements.sidebarChatsContent?.classList.remove("hidden");
    elements.sidebarFriendsContent?.classList.add("hidden");
  } else {
    elements.sidebarTabFriends?.classList.add("bg-glow/20", "text-glow");
    elements.sidebarTabFriends?.classList.remove("text-mist");
    elements.sidebarTabChats?.classList.remove("bg-glow/20", "text-glow");
    elements.sidebarTabChats?.classList.add("text-mist");
    elements.sidebarFriendsContent?.classList.remove("hidden");
    elements.sidebarChatsContent?.classList.add("hidden");
    fetchFriendsList();
  }
}

async function fetchFriendsList() {
  if (!state.myId) return;
  const response = await fetchJson("/api/friends");
  if (!response.ok || !response.data) return;
  state.friendIds = response.data.friends || [];
  
  const details = response.data.friends_details || [];
  details.forEach((user) => upsertKnownUser(user));
  
  renderFriendsList();
}

async function renderFriendsList() {
  if (!elements.friendsList) return;
  const friendIds = state.friendIds || [];
  elements.friendsList.innerHTML = "";

  if (friendIds.length === 0) {
    elements.friendsList.innerHTML = `
      <div class="text-center text-xs text-mist p-6 border border-dashed border-glass-border rounded-2xl">
        <i class="ph-duotone ph-users-three text-2xl mb-2 block text-mist/50"></i>
        No friends yet.<br>Use Discovery to find and add friends.
      </div>`;
    updateFriendsOnlineCount(0);
    return;
  }

  // Sort: online friends first, then alphabetically
  const sorted = [...friendIds].sort((a, b) => {
    const aOnline = state.onlineUsers.has(a) ? 0 : 1;
    const bOnline = state.onlineUsers.has(b) ? 0 : 1;
    if (aOnline !== bOnline) return aOnline - bOnline;
    return getDisplayName(a).localeCompare(getDisplayName(b));
  });

  let onlineCount = 0;

  for (const friendId of sorted) {
    const isOnline = state.onlineUsers.has(friendId);
    if (isOnline) onlineCount++;
    const isActive = state.activePeerId === friendId;
    const isConnected = state.peers[friendId]?.dataChannel?.readyState === "open";

    const item = document.createElement("div");
    item.className = `flex items-center gap-3 rounded-2xl border p-3 cursor-pointer transition-all duration-200 group ${
      isActive
        ? "bg-glow/10 border-glow/40 shadow-glow"
        : "bg-black/40 border-glass-border hover:bg-black/70 hover:border-glow/30 hover:shadow-[0_0_10px_rgba(129,140,248,0.15)]"
    }`;

    item.innerHTML = `
      <div class="relative flex-shrink-0 h-10 w-10 rounded-full overflow-hidden shadow-lg">
        <img src="${getAvatarUrl(friendId)}" alt="" class="h-full w-full object-cover" onerror="this.src='https://api.dicebear.com/9.x/initials/svg?seed=${friendId}'" />
        <span class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-obsidian ${isOnline ? 'bg-neon-green shadow-green-glow' : 'bg-zinc-600'}"></span>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold truncate ${isActive ? 'text-glow' : 'text-zinc-200 group-hover:text-white'} transition-colors">${getDisplayName(friendId)}</p>
        <p class="text-[10px] ${isOnline ? 'text-neon-green' : 'text-mist'} uppercase tracking-wider font-medium">${isConnected ? '🔒 Connected' : isOnline ? '● Online' : '○ Offline'}</p>
      </div>
      <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button class="friend-chat-btn h-8 w-8 rounded-xl flex items-center justify-center ${isOnline ? 'bg-glow/20 text-glow hover:bg-glow hover:text-black' : 'bg-black/50 text-mist hover:text-white'} transition-all" title="Chat">
          <i class="ph-bold ph-chat-teardrop-dots text-sm"></i>
        </button>
      </div>
    `;

    item.addEventListener("click", (e) => {
      if (e.target.closest('.friend-chat-btn')) {
        e.stopPropagation();
      }
      connectToPeer(friendId, true);
    });

    elements.friendsList.appendChild(item);
  }

  updateFriendsOnlineCount(onlineCount);
}

function updateFriendsOnlineCount(count) {
  if (!elements.friendsOnlineCount) return;
  if (count > 0) {
    elements.friendsOnlineCount.textContent = count;
    elements.friendsOnlineCount.classList.remove("hidden");
    elements.friendsOnlineCount.classList.add("flex");
  } else {
    elements.friendsOnlineCount.classList.add("hidden");
    elements.friendsOnlineCount.classList.remove("flex");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp, { once: true });
} else {
  startApp();
}

window.addEventListener("load", startApp, { once: true });
