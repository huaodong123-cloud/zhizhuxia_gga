import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('shows concise Zhizhuxia api-key login without account fields', async () => {
  const html = await readFile(new URL('../../web/index.html', import.meta.url), 'utf8');

  assert.match(html, /智助侠/);
  assert.match(html, /id="login-view"/);
  assert.match(html, /id="api-key-input"/);
  assert.match(html, /id="chat-view"/);
  assert.doesNotMatch(html, /游戏攻略代理实验室/);
  assert.doesNotMatch(html, /本地部署/);
  assert.doesNotMatch(html, /本次浏览器会话内临时使用/);
  assert.doesNotMatch(html, /name="username"/);
  assert.doesNotMatch(html, /name="password"/);
  assert.doesNotMatch(html, /name="email"/);
});

test('provides chat controls, settings, and agent selector', async () => {
  const html = await readFile(new URL('../../web/index.html', import.meta.url), 'utf8');

  assert.match(html, /id="agent-select"/);
  assert.match(html, /value="chief"/);
  assert.match(html, /value="mechanics"/);
  assert.match(html, /id="settings-panel"/);
  assert.doesNotMatch(html, /研究优先级/);
  assert.doesNotMatch(html, /哔哩哔哩优先/);
  assert.match(html, /id="chat-form"/);
  assert.match(html, /id="chat-panel"/);
  assert.doesNotMatch(html, /id="chat-tab-button"/);
  assert.doesNotMatch(html, /id="rank-tab-button"/);
  assert.doesNotMatch(html, /id="rank-panel"/);
  assert.doesNotMatch(html, /id="sample-button"/);
  assert.doesNotMatch(html, />样例</);
  assert.match(html, /id="message-input"/);
  assert.match(html, /id="chat-stream"/);
  assert.doesNotMatch(html, /id="rank-tool-form"/);
  assert.doesNotMatch(html, /id="rank-items-input"/);
  assert.doesNotMatch(html, /告诉我游戏、卡点和你已有资源/);
  assert.match(html, />总控攻略代理</);
  assert.match(html, />机制分析代理</);
  assert.doesNotMatch(html, />Chief Guide</);
  assert.doesNotMatch(html, />Mechanics Analyst</);
});

test('minimal agent page avoids helper copy and examples', async () => {
  const html = await readFile(new URL('../../web/index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../../web/app.js', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /示例|例如|开始提问|输入密钥/);
  assert.doesNotMatch(html, /游戏攻略聊天侧边工具|功能切换|攻略工具/);
  assert.doesNotMatch(script, /知识判断和代理流程运行中|质量检查：通过/);
  assert.match(html, /id="message-input"/);
  assert.match(html, /id="settings-button"/);
});

test('chat script keeps api key in memory and posts to chat api', async () => {
  const script = await readFile(new URL('../../web/app.js', import.meta.url), 'utf8');

  assert.match(script, /let sessionApiKey = ''/);
  assert.doesNotMatch(script, /localStorage/);
  assert.doesNotMatch(script, /sessionStorage/);
  assert.doesNotMatch(script, /sampleButton/);
  assert.match(script, /fetch\('\/api\/chat'/);
  assert.match(script, /renderSourceCards/);
  assert.match(script, /renderHarnessWarnings/);
  assert.match(script, /renderMarkdown/);
  assert.doesNotMatch(script, /setActivePanel/);
  assert.doesNotMatch(script, /fetch\('\/api\/tools\/rank'/);
  assert.doesNotMatch(script, /知识判断和代理流程运行中/);
  assert.doesNotMatch(script, /质量检查：通过/);
  assert.doesNotMatch(script, /Running knowledge check/);
  assert.doesNotMatch(script, /Harness: ok/);
});

test('hidden views are not overridden by layout display rules', async () => {
  const styles = await readFile(new URL('../../web/styles.css', import.meta.url), 'utf8');

  assert.match(styles, /\[hidden\]\s*\{/);
  assert.match(styles, /display:\s*none\s*!important/);
  assert.match(styles, /douyin\.com\/video\/7530637790124510490/);
  assert.match(styles, /--rank-bg/);
});

test('codex style keeps the composer floating above fading chat content', async () => {
  const styles = await readFile(new URL('../../web/styles.css', import.meta.url), 'utf8');

  assert.match(styles, /color-scheme:\s*dark/);
  assert.match(styles, /\.chat-view::after\s*\{/);
  assert.match(styles, /linear-gradient\(180deg,\s*rgba\(15,\s*15,\s*15,\s*0\)/);
  assert.match(styles, /\.composer\s*\{[\s\S]*position:\s*absolute/);
  assert.match(styles, /\.composer\s*\{[\s\S]*bottom:\s*18px/);
  assert.match(styles, /\.chat-stream\s*\{[\s\S]*padding-bottom:\s*180px/);
  assert.match(styles, /backdrop-filter:\s*blur\(18px\)/);
});
