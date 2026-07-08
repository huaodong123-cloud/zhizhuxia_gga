const loginView = document.querySelector('#login-view');
const chatView = document.querySelector('#chat-view');
const loginForm = document.querySelector('#login-form');
const apiKeyInput = document.querySelector('#api-key-input');
const loginError = document.querySelector('#login-error');
const settingsButton = document.querySelector('#settings-button');
const settingsPanel = document.querySelector('#settings-panel');
const settingsApiKey = document.querySelector('#settings-api-key');
const saveSettingsButton = document.querySelector('#save-settings-button');
const chatPanel = document.querySelector('#chat-panel');
const agentSelect = document.querySelector('#agent-select');
const gameNameInput = document.querySelector('#game-name-input');
const chatStream = document.querySelector('#chat-stream');
const chatForm = document.querySelector('#chat-form');
const messageInput = document.querySelector('#message-input');

let sessionApiKey = '';

const agentLabels = {
  chief: '总控攻略代理',
  research: '资料检索代理',
  mechanics: '机制分析代理',
  build: '配装建议代理',
  route: '路线规划代理',
  combat: '战斗教练代理',
  critic: '质量审查代理'
};

const confidenceLabels = {
  low: '低',
  medium: '中',
  high: '高'
};

const sourceLabels = {
  bilibili: '哔哩哔哩',
  xiaoheihe: '小黑盒'
};

const freshnessLabels = {
  unknown: '新鲜度未知',
  'likely-current': '可能较新',
  'possibly-outdated': '可能过期'
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderInlineMarkdown(value) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderMarkdown(markdown = '') {
  const lines = String(markdown).split(/\r?\n/);
  const html = [];
  let listOpen = false;
  let codeOpen = false;

  function closeList() {
    if (listOpen) {
      html.push('</ol>');
      listOpen = false;
    }
  }

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      closeList();
      html.push(codeOpen ? '</code></pre>' : '<pre><code>');
      codeOpen = !codeOpen;
      continue;
    }

    if (codeOpen) {
      html.push(`${escapeHtml(line)}\n`);
      continue;
    }

    if (/^##\s+/.test(line)) {
      closeList();
      html.push(`<h3>${renderInlineMarkdown(line.replace(/^##\s+/, ''))}</h3>`);
      continue;
    }

    if (/^#\s+/.test(line)) {
      closeList();
      html.push(`<h3>${renderInlineMarkdown(line.replace(/^#\s+/, ''))}</h3>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      if (!listOpen) {
        html.push('<ol>');
        listOpen = true;
      }
      html.push(`<li>${renderInlineMarkdown(line.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      if (!listOpen) {
        html.push('<ol>');
        listOpen = true;
      }
      html.push(`<li>${renderInlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }

    closeList();

    if (line.trim()) {
      html.push(`<p>${renderInlineMarkdown(line)}</p>`);
    }
  }

  closeList();
  if (codeOpen) html.push('</code></pre>');
  return html.join('');
}

function enterChat(apiKey) {
  sessionApiKey = apiKey;
  settingsApiKey.value = apiKey;
  loginView.hidden = true;
  chatView.hidden = false;
  messageInput.focus();
}

function appendMessage(role, label, html) {
  const article = document.createElement('article');
  article.className = `message ${role}`;
  article.innerHTML = `
    <div class="message-meta">${escapeHtml(label)}</div>
    <div class="message-body">${html}</div>
  `;
  chatStream.append(article);
  chatStream.scrollTop = chatStream.scrollHeight;
}

function renderSourceCards(sources = []) {
  if (!sources.length) return '';

  return `
    <div class="source-list">
      ${sources.map((source) => `
        <a class="source-card" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">
          <span>${escapeHtml(sourceLabels[source.source] || source.source)}</span>
          <strong>${escapeHtml(source.title)}</strong>
          <small>${escapeHtml(freshnessLabels[source.freshness] || source.freshness)}</small>
          <p>${escapeHtml(source.summary)}</p>
        </a>
      `).join('')}
    </div>
  `;
}

function renderHarnessWarnings(harness) {
  if (!harness?.warnings?.length) {
    return '';
  }

  return `
    <ul class="harness warning">
      ${harness.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}
    </ul>
  `;
}

function renderAssistantResponse(payload) {
  const sourceCards = renderSourceCards(payload.sources);
  const warnings = renderHarnessWarnings(payload.harness);

  appendMessage('assistant', agentLabels[payload.agentId] || payload.agentId, `
    <div class="markdown-body">${renderMarkdown(payload.answer)}</div>
    ${sourceCards}
    ${warnings}
  `);
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    loginError.textContent = '请输入 DeepSeek 密钥。';
    return;
  }

  loginError.textContent = '';
  enterChat(apiKey);
});

settingsButton.addEventListener('click', () => {
  settingsPanel.hidden = !settingsPanel.hidden;
});

saveSettingsButton.addEventListener('click', () => {
  const apiKey = settingsApiKey.value.trim();
  if (!apiKey) return;
  sessionApiKey = apiKey;
  settingsPanel.hidden = true;
});

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;

  appendMessage('user', '你', `<p>${escapeHtml(message)}</p>`);
  messageInput.value = '';
  appendMessage('assistant pending', '智助侠', '<p>思考中...</p>');

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      apiKey: sessionApiKey,
      agentId: agentSelect.value,
      message,
      gameName: gameNameInput.value.trim()
    })
  });

  const pending = chatStream.querySelector('.message.pending');
  if (pending) pending.remove();

  const payload = await response.json();
  if (!response.ok) {
    appendMessage('assistant error', '智助侠', `<p>${escapeHtml((payload.errors || ['请求失败']).join(' / '))}</p>`);
    return;
  }

  renderAssistantResponse(payload);
});
