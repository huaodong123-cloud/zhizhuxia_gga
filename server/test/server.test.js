import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createAppServer, isMainModule, resolveProjectRoot } from '../src/server.js';

test('detects direct execution on Windows style paths', () => {
  const entryPath = 'D:\\workspace\\game-guide-agent-lab\\server\\src\\server.js';
  assert.equal(isMainModule(entryPath, pathToFileURL(entryPath).href), true);
});

test('detects direct execution from a relative script path', () => {
  const entryPath = 'server/src/server.js';
  const moduleUrl = pathToFileURL('D:\\workspace\\game-guide-agent-lab\\server\\src\\server.js').href;
  assert.equal(isMainModule(entryPath, moduleUrl, 'D:\\workspace\\game-guide-agent-lab'), true);
});

test('resolves project root from server module url', () => {
  const entryPath = 'D:\\workspace\\game-guide-agent-lab\\server\\src\\server.js';
  assert.equal(resolveProjectRoot(pathToFileURL(entryPath).href).endsWith('game-guide-agent-lab'), true);
});

test('health endpoint reports GLM-5.2 model identity', async () => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.model, 'glm-5.2');
  assert.equal(payload.provider, 'zhipu');
  server.close();
});

test('handles chat requests', async () => {
  const server = createAppServer({
    chatHandler: async () => ({
      status: 'completed',
      agentId: 'chief',
      harness: { ok: true, warnings: [] }
    })
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiKey: 'sk-test',
        agentId: 'chief',
        message: 'How do I beat the fire boss?',
        gameName: 'Example RPG'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'completed');
    assert.equal(payload.agentId, 'chief');
    assert.equal(payload.harness.ok, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('handles research requests', async () => {
  const server = createAppServer({
    researchHandler: async () => ({
      checkedSources: ['bilibili', 'xiaoheihe'],
      searchQuery: 'Example RPG fire boss route',
      sources: [],
      failures: ['bilibili 搜索失败：503']
    })
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/research`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'chief',
        message: 'fire boss route',
        gameName: 'Example RPG'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.checkedSources, ['bilibili', 'xiaoheihe']);
    assert.deepEqual(payload.sources, []);
    assert.equal(payload.failures.length > 0, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('handles rank tool requests', async () => {
  const server = createAppServer({
    rankToolHandler: async () => ({
      status: 'completed',
      tool: 'rank-from-strong-to-weak',
      markdown: '## 从夯到拉排名\n1. 行秋\n2. 香菱',
      provider: { usage: { total_tokens: 16 } }
    })
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/tools/rank`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiKey: 'sk-test',
        gameName: '原神',
        context: '深渊配队',
        items: ['行秋', '香菱']
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'completed');
    assert.equal(payload.tool, 'rank-from-strong-to-weak');
    assert.match(payload.markdown, /从夯到拉排名/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
