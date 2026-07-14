import test from 'node:test';
import assert from 'node:assert/strict';
import { getPalworldMapTool, rankFromStrongToWeak } from '../src/tools.js';

test('palworld map tool returns live map cards for location queries', async () => {
  const result = await getPalworldMapTool({
    gameName: '幻兽帕鲁',
    query: '金属矿和传送点实时地图'
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.tool, 'palworld-live-map');
  assert.equal(result.gameId, 'palworld');
  assert.equal(result.cards.length >= 2, true);
  assert.equal(result.cards[0].source, 'palworld.gg');
  assert.match(result.cards[0].url, /^https:\/\/palworld\.gg\/map/);
  assert.equal(result.cards.some((card) => card.layers.includes('矿石')), true);
  assert.equal(result.markdown.includes('实时地图'), true);
});

test('rank tool injects user api key into model client', async () => {
  let receivedApiKey = '';
  let receivedMessages = [];
  let receivedTools = [];

  const result = await rankFromStrongToWeak({
    apiKey: 'sk-user-input',
    gameName: '原神',
    context: '深渊配队',
    items: ['芭芭拉', '行秋', '香菱']
  }, {
    modelClient: async ({ apiKey, messages, tools }) => {
      receivedApiKey = apiKey;
      receivedMessages = messages;
      receivedTools = tools;
      return {
        toolCalls: [{
          function: {
            name: 'rank_from_strong_to_weak',
            arguments: JSON.stringify({
              title: '从夯到拉排名',
              summary: '行秋最夯，芭芭拉偏功能位。',
              rankedItems: [
                { rank: 1, name: '行秋', tier: '夯', reason: '高频挂水，泛用性强。' },
                { rank: 2, name: '香菱', tier: '中', reason: '输出强，但对火免疫目标受限。' },
                { rank: 3, name: '芭芭拉', tier: '拉', reason: '能挂水回血，但输出不足。' }
              ],
              note: '按具体练度微调。'
            })
          }
        }],
        usage: { total_tokens: 30 }
      };
    }
  });

  assert.equal(receivedApiKey, 'sk-user-input');
  assert.equal(receivedMessages.some((message) => message.content.includes('从夯到拉')), true);
  assert.equal(receivedMessages.some((message) => message.content.includes('芭芭拉')), true);
  assert.equal(receivedTools[0].function.name, 'rank_from_strong_to_weak');
  assert.equal(result.status, 'completed');
  assert.match(result.markdown, /## 从夯到拉排名/);
  assert.match(result.markdown, /\*\*行秋\*\*/);
  assert.equal(result.provider.usage.total_tokens, 30);
});

test('rank tool rejects empty candidates', async () => {
  const result = await rankFromStrongToWeak({
    apiKey: 'sk-test',
    items: []
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.errors, ['至少输入两个候选项']);
});
