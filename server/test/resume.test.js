import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatResponse, resetSessionMemory } from '../src/chat.js';

test('/resume searches previous session memory without calling research or model', async () => {
  resetSessionMemory();
  let researchCalls = 0;
  let modelCalls = 0;

  await createChatResponse({
    apiKey: 'sk-test',
    agentId: 'chief',
    message: '金属矿据点怎么建？',
    gameName: '幻兽帕鲁'
  }, {
    researchClient: async () => ({
      checkedSources: ['rag'],
      searchQuery: '幻兽帕鲁 金属矿据点',
      sources: [],
      failures: []
    }),
    modelClient: async () => {
      modelCalls += 1;
      return {
        answer: '前期金属矿据点要贴近矿点，并准备床、温泉和食物。',
        usage: { total_tokens: 16 }
      };
    }
  });

  const response = await createChatResponse({
    apiKey: 'sk-test',
    agentId: 'chief',
    message: '/resume 金属矿',
    gameName: '幻兽帕鲁'
  }, {
    researchClient: async () => {
      researchCalls += 1;
      return { checkedSources: [], searchQuery: '', sources: [], failures: [] };
    },
    modelClient: async () => {
      modelCalls += 1;
      return { answer: 'should not be called', usage: { total_tokens: 1 } };
    }
  });

  assert.equal(response.status, 'completed');
  assert.equal(response.intent, 'resume');
  assert.deepEqual(response.workflowStages, ['intent', 'memory']);
  assert.equal(researchCalls, 0);
  assert.equal(modelCalls, 1);
  assert.match(response.answer, /前期金属矿据点/);
});
