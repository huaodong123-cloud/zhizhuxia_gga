import test from 'node:test';
import assert from 'node:assert/strict';
import { runResearchQuery } from '../src/research.js';

test('research checks bilibili before xiaoheihe', async () => {
  const result = await runResearchQuery({
    gameName: '示例角色扮演游戏',
    message: '火首领路线',
    agentId: 'chief',
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      text: async () => ''
    })
  });

  assert.deepEqual(result.checkedSources, ['bilibili', 'xiaoheihe']);
});

test('research extracts game source cards from bilibili before xiaoheihe', async () => {
  const requestedUrls = [];

  const result = await runResearchQuery({
    gameName: '示例角色扮演游戏',
    message: '火首领路线',
    agentId: 'chief',
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      if (url.includes('bilibili')) {
        return {
          ok: true,
          text: async () => '<a href="//www.bilibili.com/video/BV1abc" title="火首领最新路线">火首领最新路线</a>'
        };
      }
      return {
        ok: true,
        text: async () => '<a href="https://www.xiaoheihe.cn/community/123">小黑盒火首领讨论</a>'
      };
    }
  });

  assert.equal(requestedUrls[0].includes('search.bilibili.com'), true);
  assert.equal(requestedUrls[1].includes('xiaoheihe'), true);
  assert.deepEqual(result.checkedSources, ['bilibili', 'xiaoheihe']);
  assert.equal(result.sources.length, 2);
  assert.deepEqual(result.sources[0], {
    source: 'bilibili',
    title: '火首领最新路线',
    url: 'https://www.bilibili.com/video/BV1abc',
    summary: '搜索命中：火首领最新路线',
    freshness: 'search-result'
  });
});

test('research returns failures without fabricating source cards when adapters fail', async () => {
  const result = await runResearchQuery({
    gameName: '示例角色扮演游戏',
    message: '火首领路线',
    agentId: 'chief',
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      text: async () => ''
    })
  });

  assert.deepEqual(result.sources, []);
  assert.equal(result.failures.length > 0, true);
  assert.match(result.failures[0], /bilibili 搜索失败：503/);
});
