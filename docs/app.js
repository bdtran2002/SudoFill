/* global DOMParser, Headers, URL, crypto, document, fetch, localStorage, navigator, window */

(() => {
  const API_BASE_URL = 'https://api.mail.tm';
  const STORAGE_KEY = 'sudofill.pages.mailbox.session';
  const POLL_INTERVAL_MS = 15000;
  const MOBILE_BREAKPOINT = '(max-width: 840px)';
  const CODE_PATTERN =
    /\b(?:code|verification|otp|auth|pin|passcode)\D{0,24}([A-Z0-9-]{4,10}|\d{4,8})\b/i;
  const FALLBACK_CODE_PATTERN = /\b\d{4,8}\b/g;
  const LINK_PATTERN = /https?:\/\/[^\s"'<>]+/gi;

  const elements = {
    shell: document.querySelector('[data-shell]'),
    banner: document.querySelector('[data-mailbox-banner]'),
    availability: document.querySelector('[data-mailbox-availability]'),
    unread: document.querySelector('[data-mailbox-unread]'),
    polling: document.querySelector('[data-mailbox-polling]'),
    address: document.querySelector('[data-mailbox-address]'),
    disclaimer: document.querySelector('[data-mailbox-disclaimer]'),
    lastChecked: document.querySelector('[data-mailbox-last-checked]'),
    statusCopy: document.querySelector('[data-mailbox-status-copy]'),
    count: document.querySelector('[data-mailbox-count]'),
    messageList: document.querySelector('[data-message-list]'),
    detailEmpty: document.querySelector('[data-detail-empty]'),
    detailView: document.querySelector('[data-detail-view]'),
    detailBack: document.querySelector('[data-detail-back]'),
    detailPrimary: document.querySelector('[data-detail-primary]'),
    detailSecondary: document.querySelector('[data-detail-secondary]'),
    detailSubject: document.querySelector('[data-detail-subject]'),
    detailFrom: document.querySelector('[data-detail-from]'),
    detailTime: document.querySelector('[data-detail-time]'),
    detailActions: document.querySelector('[data-detail-actions]'),
    detailBody: document.querySelector('[data-detail-body]'),
    detailMeta: document.querySelector('[data-detail-meta]'),
    footer: document.querySelector('[data-mailbox-footer]'),
    messageTemplate: document.querySelector('#message-row-template'),
  };

  const state = {
    session: loadSession(),
    messages: [],
    selectedMessageId: null,
    selectedMessage: null,
    unreadIds: new Set(),
    pollTimer: null,
    busy: false,
    statusText: 'Ready',
    statusTone: 'neutral',
    lastCheckedAt: null,
    isMobileLayout: window.matchMedia(MOBILE_BREAKPOINT).matches,
    preferInboxView: false,
  };
  const mobileMedia = window.matchMedia(MOBILE_BREAKPOINT);

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveSession() {
    if (!state.session) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.session));
  }

  function setBusy(busy) {
    state.busy = busy;
    renderActionStates();

    elements.messageList?.setAttribute('aria-busy', String(busy));
  }

  function renderActionStates() {
    const hasSession = Boolean(state.session?.token);

    document.querySelectorAll('button[data-action]').forEach((button) => {
      const action = button.dataset.action;
      const requiresSession =
        action === 'refresh' || action === 'copy-address' || action === 'discard';
      button.disabled = state.busy || (requiresSession && !hasSession);
    });
  }

  function setStatus(text, tone = 'neutral') {
    state.statusText = text;
    state.statusTone = tone;
    renderStatus();
  }

  function renderLayout() {
    if (!elements.shell) {
      return;
    }

    const mobileView = state.isMobileLayout
      ? state.selectedMessage
        ? 'detail'
        : 'inbox'
      : 'desktop';

    elements.shell.setAttribute('data-mailbox-mobile-view', mobileView);
  }

  function renderStatus() {
    const unreadCount = state.messages.filter((message) => state.unreadIds.has(message.id)).length;
    const hasSession = Boolean(state.session?.token);
    const pollingOn = Boolean(state.pollTimer);

    if (elements.availability) {
      elements.availability.textContent = state.statusText;
    }

    if (elements.banner) {
      const isIdleReady = state.statusText === 'Ready' && state.statusTone === 'neutral';
      elements.banner.hidden = isIdleReady;
      elements.banner.dataset.tone = state.statusTone;
      elements.banner.textContent = state.statusText;
    }

    if (elements.unread) {
      elements.unread.textContent = `${unreadCount} unread`;
    }

    if (elements.polling) {
      elements.polling.textContent = pollingOn ? 'Polling on' : 'Polling off';
    }

    if (elements.count) {
      elements.count.textContent = `${state.messages.length} ${state.messages.length === 1 ? 'message' : 'messages'}`;
    }

    if (elements.address) {
      elements.address.textContent =
        state.session?.address ?? 'Create a temporary mailbox to begin.';
    }

    if (elements.disclaimer) {
      elements.disclaimer.textContent = hasSession
        ? 'Web mailbox version. Verification links and codes work here, but extension-only actions stay in the add-on.'
        : 'Web mailbox version. Create an inbox to start collecting verification mail.';
    }

    if (elements.lastChecked) {
      elements.lastChecked.textContent = state.lastCheckedAt
        ? `Last checked ${formatTimestamp(state.lastCheckedAt)}`
        : 'Not checked yet';
    }

    if (elements.statusCopy) {
      elements.statusCopy.textContent = hasSession
        ? state.statusText
        : 'Create a temp mailbox to start collecting verification emails.';
    }

    if (elements.footer) {
      elements.footer.textContent = hasSession
        ? `Web mailbox version · ${state.session.address}`
        : 'Web mailbox version';
    }

    elements.shell?.setAttribute('data-mailbox-state', hasSession ? 'active' : 'empty');
    renderLayout();
    renderActionStates();
  }

  function getHostname(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  function createTextBlock(className, text) {
    const node = document.createElement('span');
    node.className = className;
    node.textContent = text;
    return node;
  }

  function createVerificationLinkCard(url) {
    const button = document.createElement('button');
    button.className = 'verification-card verification-card--link';
    button.type = 'button';
    button.addEventListener('click', () => window.open(url, '_blank', 'noopener,noreferrer'));

    const icon = document.createElement('span');
    icon.className = 'verification-card-icon';
    icon.textContent = '↗';

    const body = document.createElement('span');
    body.className = 'verification-card-body';
    body.append(
      createTextBlock('verification-card-kicker', 'Open link'),
      createTextBlock('verification-card-title', url),
    );

    const host = getHostname(url);
    if (host) {
      body.append(createTextBlock('verification-card-hint', host));
    }

    button.append(icon, body);
    return button;
  }

  function createVerificationCodeCard(code, label) {
    const button = document.createElement('button');
    button.className = 'verification-card verification-card--code';
    button.type = 'button';
    button.addEventListener('click', () => void copyToClipboard(code, 'Code copied.'));

    const body = document.createElement('span');
    body.className = 'verification-card-body';
    body.append(
      createTextBlock('verification-card-kicker', 'Copy code'),
      createTextBlock('verification-card-title verification-card-title--code', code),
    );

    const labelNode = document.createElement('span');
    labelNode.className = 'verification-card-hint';
    labelNode.textContent = label || 'Verification code';

    const action = document.createElement('span');
    action.className = 'verification-card-action';
    action.textContent = 'Copy';

    const meta = document.createElement('span');
    meta.className = 'verification-card-meta';
    meta.append(labelNode, action);

    button.append(body, meta);
    return button;
  }

  function createVerificationMiniAction({ label, detail, onClick, tone = 'default' }) {
    const button = document.createElement('button');
    button.className = `verification-mini-action verification-mini-action--${tone}`;
    button.type = 'button';
    button.addEventListener('click', () => onClick());

    const text = document.createElement('span');
    text.className = 'verification-mini-action-label';
    text.textContent = label;

    button.append(text);

    if (detail) {
      const hint = document.createElement('span');
      hint.className = 'verification-mini-action-hint';
      hint.textContent = detail;
      button.append(hint);
    }

    return button;
  }

  function renderVerificationActions(detail, verification) {
    if (elements.detailPrimary) {
      elements.detailPrimary.innerHTML = '';
    }
    if (elements.detailSecondary) {
      elements.detailSecondary.innerHTML = '';
    }

    const primaryGrid = document.createElement('div');
    primaryGrid.className = 'detail-primary-grid';

    if (verification.bestLink) {
      primaryGrid.append(createVerificationLinkCard(verification.bestLink));
    }

    if (verification.bestCode) {
      primaryGrid.append(
        createVerificationCodeCard(verification.bestCode, 'Primary verification code'),
      );
    }

    if (elements.detailPrimary && primaryGrid.childNodes.length > 0) {
      elements.detailPrimary.append(primaryGrid);
    }

    const extraLinks = verification.links.filter((link) => link !== verification.bestLink);
    const extraCodes = verification.codes.filter((code) => code !== verification.bestCode);

    if ((extraLinks.length || extraCodes.length) && elements.detailSecondary) {
      const wrapper = document.createElement('div');
      wrapper.className = 'verification-secondary-group';

      const title = document.createElement('p');
      title.className = 'verification-secondary-title';
      title.textContent = 'More actions';
      wrapper.append(title);

      if (extraLinks.length) {
        const links = document.createElement('div');
        links.className = 'verification-secondary-list';

        extraLinks.forEach((link, index) => {
          links.append(
            createVerificationMiniAction({
              label: 'Open extra link',
              detail: getHostname(link) || `Link ${index + 2}`,
              tone: 'link',
              onClick: () => window.open(link, '_blank', 'noopener,noreferrer'),
            }),
          );
        });

        wrapper.append(links);
      }

      if (extraCodes.length) {
        const codes = document.createElement('div');
        codes.className = 'verification-secondary-list';

        extraCodes.forEach((code, index) => {
          codes.append(
            createVerificationMiniAction({
              label: code,
              detail: `Extra code ${index + 1}`,
              tone: 'code',
              onClick: () => void copyToClipboard(code, 'Code copied.'),
            }),
          );
        });

        wrapper.append(codes);
      }

      elements.detailSecondary.append(wrapper);
    }
  }

  async function api(path, init = {}, token = state.session?.token) {
    const headers = new Headers(init.headers || {});
    if (!headers.has('Content-Type') && init.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      let message = `Mail.tm request failed with ${response.status}`;
      try {
        const body = await response.json();
        if (typeof body?.detail === 'string' && body.detail) {
          message = body.detail;
        }
      } catch {
        const text = await response.text().catch(() => '');
        if (text) {
          message = text;
        }
      }

      throw new Error(message);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  async function listDomains() {
    const response = await api('/domains');
    const domains = (response['hydra:member'] || [])
      .filter((domain) => domain.isActive && !domain.isPrivate)
      .map((domain) => domain.domain)
      .filter(Boolean);

    if (!domains.length) {
      throw new Error('No Mail.tm domains are currently available.');
    }

    return domains;
  }

  function randomString(length) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  }

  function createCredentials(domain) {
    return {
      address: `${randomString(12)}@${domain}`,
      password: `${randomString(16)}A1`,
    };
  }

  function formatTimestamp(value) {
    if (!value) {
      return 'Just now';
    }

    const date = new Date(value);
    const diff = Date.now() - date.getTime();
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) {
      return 'Just now';
    }
    if (diff < hour) {
      return `${Math.max(1, Math.round(diff / minute))} min ago`;
    }
    if (diff < day) {
      return `${Math.max(1, Math.round(diff / hour))} hr ago`;
    }

    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function trimTrailingLinkPunctuation(url) {
    return url.replace(/[),.;]+$/g, '');
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function normalizeMessageSummary(message) {
    const fromAddress = message.from?.address || 'Unknown sender';
    const fromName = message.from?.name?.trim();

    return {
      id: message.id,
      from: fromName ? `${fromName} <${fromAddress}>` : fromAddress,
      subject: message.subject?.trim() || '(no subject)',
      intro: message.intro?.trim() || 'No preview available.',
      createdAt: message.createdAt || new Date().toISOString(),
      seen: Boolean(message.seen),
      hasAttachments: Boolean(message.hasAttachments),
    };
  }

  function normalizeHtml(html) {
    if (Array.isArray(html)) {
      return html.join('\n\n');
    }

    return html || '';
  }

  function detectVerificationContent(detail) {
    const searchableText = [detail.subject, detail.text, detail.html].filter(Boolean).join('\n');
    const links = unique(
      [...searchableText.matchAll(LINK_PATTERN)].map((match) =>
        trimTrailingLinkPunctuation(match[0]),
      ),
    );

    const primaryCode = searchableText.match(CODE_PATTERN)?.[1] || null;
    const fallbackCodes = [...searchableText.matchAll(FALLBACK_CODE_PATTERN)].map(
      (match) => match[0],
    );
    const codes = unique(primaryCode ? [primaryCode, ...fallbackCodes] : fallbackCodes).slice(0, 5);

    return {
      links,
      codes,
      bestLink: links[0] || null,
      bestCode: codes[0] || null,
    };
  }

  function renderMessageList() {
    if (!elements.messageList || !elements.messageTemplate) {
      return;
    }

    elements.messageList.innerHTML = '';

    if (!state.messages.length) {
      const empty = document.createElement('div');
      empty.className = 'detail-empty';
      empty.innerHTML = `
        <p class="eyebrow">Inbox</p>
        <h2>No messages yet</h2>
        <p>Keep this tab open while signing up, then refresh or wait for new mail to arrive.</p>
      `;
      elements.messageList.append(empty);
      return;
    }

    const selectedId = state.selectedMessageId;

    for (const message of state.messages) {
      const fragment = elements.messageTemplate.content.cloneNode(true);
      const button = fragment.querySelector('[data-message-id]');
      const subject = fragment.querySelector('[data-message-subject]');
      const time = fragment.querySelector('[data-message-time]');
      const from = fragment.querySelector('[data-message-from]');
      const snippet = fragment.querySelector('[data-message-snippet]');
      const dot = fragment.querySelector('.message-dot');
      const isSelected = message.id === selectedId;
      const isUnread = !message.seen || state.unreadIds.has(message.id);

      button.dataset.messageId = message.id;
      button.classList.toggle('is-selected', isSelected);
      button.classList.toggle('is-active', isSelected);
      button.classList.toggle('is-unread', isUnread);
      button.setAttribute('aria-current', isSelected ? 'true' : 'false');

      if (isUnread) {
        dot.classList.add('is-unread');
      }

      subject.textContent = message.subject;
      time.textContent = formatTimestamp(message.createdAt);
      from.textContent = message.from;
      snippet.textContent = message.intro;
      elements.messageList.append(fragment);
    }
  }

  function renderDetail() {
    const detail = state.selectedMessage;

    if (!detail) {
      elements.detailEmpty.hidden = false;
      elements.detailView.hidden = true;
      return;
    }

    const verification = detectVerificationContent(detail);
    elements.detailEmpty.hidden = true;
    elements.detailView.hidden = false;
    elements.detailSubject.textContent = detail.subject;
    elements.detailFrom.textContent = detail.from;
    elements.detailTime.textContent = formatTimestamp(detail.createdAt);
    renderVerificationActions(detail, verification);
    elements.detailMeta.innerHTML = '';

    renderDetailBody(detail);

    const chips = [
      `${verification.links.length} ${verification.links.length === 1 ? 'link' : 'links'}`,
      `${verification.codes.length} ${verification.codes.length === 1 ? 'code' : 'codes'}`,
      detail.seen ? 'Seen' : 'Unread',
    ];

    if (detail.hasAttachments) {
      chips.push('Has attachments');
    }

    for (const chipText of chips) {
      const chip = document.createElement('span');
      chip.className = 'meta-chip';
      chip.textContent = chipText;
      elements.detailMeta.append(chip);
    }
  }

  function renderDetailBody(detail) {
    elements.detailBody.innerHTML = '';

    if (detail.html?.trim()) {
      const documentFragment = new DOMParser().parseFromString(detail.html, 'text/html');
      sanitizeHtml(documentFragment.body);
      elements.detailBody.append(...Array.from(documentFragment.body.childNodes));
      return;
    }

    const paragraphs = (detail.text || '').split(/\n{2,}/).filter(Boolean);
    if (!paragraphs.length) {
      const empty = document.createElement('p');
      empty.textContent = '[empty message]';
      elements.detailBody.append(empty);
      return;
    }

    for (const paragraphText of paragraphs) {
      const paragraph = document.createElement('p');
      paragraph.textContent = paragraphText.trim();
      elements.detailBody.append(paragraph);
    }
  }

  function sanitizeHtml(root) {
    const blockedTags = new Set([
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'option',
    ]);

    for (const element of Array.from(root.querySelectorAll('*'))) {
      const tagName = element.tagName.toLowerCase();
      if (blockedTags.has(tagName)) {
        element.remove();
        continue;
      }

      for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value;
        const isEventHandler = name.startsWith('on');
        const isUnsafeHref = (name === 'href' || name === 'src') && !/^https?:/i.test(value);
        const isStyle = name === 'style';

        if (isEventHandler || isUnsafeHref || isStyle) {
          element.removeAttribute(attribute.name);
        }
      }

      if (tagName === 'a') {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noreferrer noopener');
      }
    }
  }

  function render() {
    renderStatus();
    renderMessageList();
    renderDetail();
  }

  function backToInbox() {
    if (!state.selectedMessageId && !state.selectedMessage) {
      return;
    }

    state.selectedMessageId = null;
    state.selectedMessage = null;
    state.preferInboxView = true;
    render();
  }

  async function copyToClipboard(value, successMessage) {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setStatus(successMessage, 'success');
    } catch {
      setStatus('Clipboard access failed.', 'error');
    }
  }

  async function createMailbox() {
    setBusy(true);
    setStatus('Creating inbox…');
    state.preferInboxView = false;

    try {
      const domains = await listDomains();
      let lastError = null;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const credentials = createCredentials(domains[Math.floor(Math.random() * domains.length)]);

        try {
          const account = await api('/accounts', {
            method: 'POST',
            body: JSON.stringify(credentials),
          });
          const token = await api('/token', {
            method: 'POST',
            body: JSON.stringify(credentials),
          });

          state.session = {
            accountId: account.id,
            address: account.address,
            password: credentials.password,
            token: token.token,
            createdAt: new Date().toISOString(),
          };
          state.messages = [];
          state.selectedMessageId = null;
          state.selectedMessage = null;
          state.unreadIds = new Set();
          saveSession();
          await refreshInbox();
          setStatus('Temporary mailbox created.', 'success');
          startPolling();
          return;
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError || new Error('Could not create mailbox.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create mailbox.', 'error');
      render();
    } finally {
      setBusy(false);
    }
  }

  async function discardMailbox() {
    if (!state.session) {
      return;
    }

    const confirmed = window.confirm('Discard this mailbox and all cached messages?');
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setStatus('Discarding mailbox…');

    try {
      try {
        await api(`/accounts/${state.session.accountId}`, { method: 'DELETE' });
      } catch {
        // Best effort, same as the extension path.
      }

      state.session = null;
      state.messages = [];
      state.selectedMessageId = null;
      state.selectedMessage = null;
      state.unreadIds = new Set();
      state.lastCheckedAt = null;
      saveSession();
      stopPolling();
      setStatus('Mailbox discarded.', 'success');
      render();
    } finally {
      setBusy(false);
    }
  }

  async function refreshInbox() {
    if (!state.session?.token) {
      render();
      return;
    }

    setStatus('Refreshing inbox…');

    try {
      const response = await api('/messages', {}, state.session.token);
      const summaries = (response['hydra:member'] || []).map(normalizeMessageSummary);
      state.messages = summaries;
      state.unreadIds = new Set(
        summaries.filter((message) => !message.seen).map((message) => message.id),
      );
      state.lastCheckedAt = new Date().toISOString();

      const nextSelectedId =
        state.selectedMessageId &&
        summaries.some((message) => message.id === state.selectedMessageId)
          ? state.selectedMessageId
          : !state.preferInboxView
            ? summaries[0]?.id || null
            : null;

      state.selectedMessageId = nextSelectedId;
      if (nextSelectedId) {
        await openMessage(nextSelectedId, { silent: true });
      } else {
        state.selectedMessage = null;
        render();
      }

      setStatus('Mailbox refreshed.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not refresh inbox.';
      setStatus(message, 'error');
      if (/401|token|jwt|unauthorized/i.test(message)) {
        state.session = null;
        state.messages = [];
        state.selectedMessage = null;
        state.selectedMessageId = null;
        state.unreadIds = new Set();
        state.lastCheckedAt = null;
        saveSession();
        stopPolling();
        render();
      }
    }
  }

  async function openMessage(messageId, options = {}) {
    if (!state.session?.token) {
      return;
    }

    state.preferInboxView = false;

    if (!options.silent) {
      setStatus('Loading message…');
      setBusy(true);
    }

    try {
      const response = await api(`/messages/${messageId}`, {}, state.session.token);
      const summary = normalizeMessageSummary(response);
      state.selectedMessageId = messageId;
      state.selectedMessage = {
        ...summary,
        to: (response.to || []).map((recipient) => recipient.address).filter(Boolean),
        text: response.text?.trim() || '',
        html: normalizeHtml(response.html),
        seen: Boolean(response.seen),
      };
      state.messages = state.messages.map((message) =>
        message.id === messageId ? { ...message, seen: true } : message,
      );
      state.unreadIds.delete(messageId);
      render();

      if (!options.silent) {
        setStatus('Message loaded.', 'success');
      }
    } catch (error) {
      if (!options.silent) {
        setStatus(error instanceof Error ? error.message : 'Could not load message.', 'error');
      }
    } finally {
      if (!options.silent) {
        setBusy(false);
      }
    }
  }

  function startPolling() {
    stopPolling();
    if (document.hidden || !state.session?.token) {
      renderStatus();
      return;
    }

    state.pollTimer = window.setInterval(() => {
      void refreshInbox();
    }, POLL_INTERVAL_MS);
    renderStatus();
  }

  function stopPolling() {
    if (state.pollTimer) {
      window.clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
    renderStatus();
  }

  async function handleAction(action) {
    if (action === 'create') {
      await createMailbox();
      return;
    }

    if (action === 'refresh') {
      await refreshInbox();
      return;
    }

    if (action === 'copy-address') {
      await copyToClipboard(state.session?.address, 'Address copied to clipboard.');
      return;
    }

    if (action === 'discard') {
      await discardMailbox();
      return;
    }

    if (action === 'open-link') {
      const bestLink = state.selectedMessage
        ? detectVerificationContent(state.selectedMessage).bestLink
        : null;
      if (bestLink) {
        window.open(bestLink, '_blank', 'noopener,noreferrer');
        setStatus('Opened verification link.', 'success');
      }
      return;
    }

    if (action === 'copy-code') {
      const bestCode = state.selectedMessage
        ? detectVerificationContent(state.selectedMessage).bestCode
        : null;
      await copyToClipboard(bestCode, 'Code copied to clipboard.');
    }
  }

  elements.messageList?.addEventListener('click', (event) => {
    const target = event.target.closest('[data-message-id]');
    const messageId = target?.dataset.messageId;
    if (messageId) {
      void openMessage(messageId);
    }
  });

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      void handleAction(button.dataset.action);
    });
  });

  elements.detailBack?.addEventListener('click', backToInbox);

  const handleMobileMediaChange = () => {
    state.isMobileLayout = mobileMedia.matches;
    renderLayout();
  };

  if (typeof mobileMedia.addEventListener === 'function') {
    mobileMedia.addEventListener('change', handleMobileMediaChange);
  } else if (typeof mobileMedia.addListener === 'function') {
    mobileMedia.addListener(handleMobileMediaChange);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPolling();
      return;
    }

    startPolling();
    if (state.session?.token) {
      void refreshInbox();
    }
  });

  render();

  if (state.session?.token) {
    setStatus('Restoring mailbox…');
    startPolling();
    void refreshInbox();
  }
})();
