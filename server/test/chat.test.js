import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatResponse } from '../src/chat.js';

test('rejects chat without an api key', async () => {
  const response = await createChatResponse({
    apiKey: '',
    agentId: 'chief',
    message: 'How do I beat the boss?',
    gameName: 'Example RPG'
  });

  assert.equal(response.status, 'failed');
  assert.deepEqual(response.errors, ['API key is required']);
});

test('three-layer intent funnel routes screenshot build questions through vision research answer', async () => {
  let receivedResearchInput = null;

  const response = await createChatResponse({
    apiKey: 'sk-test',
    agentId: 'chief',
    message: 'use this screenshot to optimize my gear build',
    gameName: 'Example RPG',
    screenshot: {
      mediaType: 'image/png',
      data: 'iVBORw0KGgo='
    }
  }, {
    visionClient: async () => ({
      summary: 'The screenshot shows a character equipment page with mixed defensive gear.',
      observations: ['equipment page', 'mixed defensive gear']
    }),
    researchClient: async (input) => {
      receivedResearchInput = input;
      return {
        checkedSources: ['bilibili', 'xiaoheihe'],
        searchQuery: 'Example RPG gear build defensive equipment',
        sources: [],
        failures: []
      };
    },
    modelClient: async () => ({
      answer: 'Prioritize a coherent gear build before upgrading scattered pieces.',
      usage: { total_tokens: 18 }
    })
  });

  assert.equal(response.status, 'completed');
  assert.equal(response.intent, 'screenshot_question');
  assert.equal(response.intentFunnel.inputType, 'screenshot_question');
  assert.equal(response.intentFunnel.taskType, 'build');
  assert.equal(response.intentFunnel.executionType, 'vision_research_answer');
  assert.equal(response.intentFunnel.recommendedAgentId, 'build');
  assert.deepEqual(response.intentFunnel.layers.map((layer) => layer.layer), ['input', 'task', 'execution']);
  assert.deepEqual(response.workflowStages, ['intent', 'vision', 'research', 'answer']);
  assert.equal(receivedResearchInput.intentFunnel.taskType, 'build');
  assert.equal(response.usedAgents.includes('build'), true);
});

test('three-layer intent funnel routes text farming questions through route research answer', async () => {
  let receivedResearchInput = null;

  const response = await createChatResponse({
    apiKey: 'sk-test',
    agentId: 'chief',
    message: 'best farming route for daily materials',
    gameName: 'Example RPG'
  }, {
    researchClient: async (input) => {
      receivedResearchInput = input;
      return {
        checkedSources: ['bilibili', 'xiaoheihe'],
        searchQuery: 'Example RPG daily materials farming route',
        sources: [],
        failures: []
      };
    },
    modelClient: async () => ({
      answer: 'Start with the daily material route, then spend resin on bottlenecks.',
      usage: { total_tokens: 16 }
    })
  });

  assert.equal(response.status, 'completed');
  assert.equal(response.intent, 'text_question');
  assert.equal(response.intentFunnel.inputType, 'text_question');
  assert.equal(response.intentFunnel.taskType, 'route');
  assert.equal(response.intentFunnel.executionType, 'research_answer');
  assert.equal(response.intentFunnel.recommendedAgentId, 'route');
  assert.deepEqual(response.workflowStages, ['intent', 'research', 'answer']);
  assert.equal(receivedResearchInput.intentFunnel.taskType, 'route');
  assert.equal(response.usedAgents.includes('route'), true);
});

test('build agent workflow drives research focus and answer policy', async () => {
  let receivedResearchInput = null;
  let receivedMessages = [];

  const response = await createChatResponse({
    apiKey: 'sk-test',
    agentId: 'chief',
    message: 'optimize my gear build for this boss',
    gameName: 'Example RPG'
  }, {
    researchClient: async (input) => {
      receivedResearchInput = input;
      return {
        checkedSources: ['bilibili', 'xiaoheihe'],
        searchQuery: input.searchQuery,
        sources: [],
        failures: []
      };
    },
    modelClient: async ({ messages }) => {
      receivedMessages = messages;
      return {
        answer: 'Use the build workflow answer.',
        usage: { total_tokens: 12 }
      };
    }
  });

  assert.equal(response.status, 'completed');
  assert.equal(response.activeWorkflow.id, 'build');
  assert.equal(response.activeWorkflow.ownerAgentId, 'build');
  assert.equal(receivedResearchInput.agentWorkflow.id, 'build');
  assert.match(receivedResearchInput.searchQuery, /gear build/);
  assert.match(receivedResearchInput.searchQuery, /配装/);
  assert.match(receivedMessages.find((message) => message.role === 'system').content, /配装工作流/);
  assert.deepEqual(response.agentWorkflowStages, ['workflow:build', 'research:build', 'answer:build', 'critic']);
});

test('manual specialist agent selection overrides the funnel workflow', async () => {
  let receivedResearchInput = null;

  const response = await createChatResponse({
    apiKey: 'sk-test',
    agentId: 'combat',
    message: 'best farming route for daily materials',
    gameName: 'Example RPG'
  }, {
    researchClient: async (input) => {
      receivedResearchInput = input;
      return {
        checkedSources: ['bilibili', 'xiaoheihe'],
        searchQuery: input.searchQuery,
        sources: [],
        failures: []
      };
    },
    modelClient: async () => ({
      answer: 'Use the combat workflow answer.',
      usage: { total_tokens: 14 }
    })
  });

  assert.equal(response.status, 'completed');
  assert.equal(response.intentFunnel.taskType, 'route');
  assert.equal(response.activeWorkflow.id, 'combat');
  assert.deepEqual(response.usedAgents, ['combat']);
  assert.equal(receivedResearchInput.agentWorkflow.id, 'combat');
  assert.match(receivedResearchInput.searchQuery, /combat/);
  assert.match(receivedResearchInput.searchQuery, /战斗/);
});

test('ranking intent in chat calls rank tool instead of normal chat model', async () => {
  let modelCalled = false;
  let receivedRankInput = null;

  const response = await createChatResponse({
    apiKey: 'sk-user-input',
    agentId: 'chief',
    message: '帮我把行秋、香菱、芭芭拉从夯到拉排名',
    gameName: '原神'
  }, {
    modelClient: async () => {
      modelCalled = true;
      return { answer: '不应该走普通聊天模型' };
    },
    rankTool: async (input) => {
      receivedRankInput = input;
      return {
        status: 'completed',
        markdown: '## 从夯到拉排名\n\n1. **行秋**（夯）：高频挂水。',
        provider: { model: 'glm-5.2', usage: { total_tokens: 16 } }
      };
    }
  });

  assert.equal(modelCalled, false);
  assert.equal(receivedRankInput.apiKey, 'sk-user-input');
  assert.equal(receivedRankInput.gameName, '原神');
  assert.deepEqual(receivedRankInput.items, ['行秋', '香菱', '芭芭拉']);
  assert.equal(response.status, 'completed');
  assert.equal(response.intent, 'ranking');
  assert.equal(response.answer, '## 从夯到拉排名\n\n1. **行秋**（夯）：高频挂水。');
  assert.equal(response.provider.usage.total_tokens, 16);
});

test('rejects unknown chat agent ids', async () => {
  const response = await createChatResponse({
    apiKey: 'sk-test',
    agentId: 'unknown',
    message: 'How do I beat the boss?',
    gameName: 'Example RPG'
  });

  assert.equal(response.status, 'failed');
  assert.deepEqual(response.errors, ['Selected agent is invalid']);
});

test('low-confidence chat does not fabricate research sources', async () => {
  const response = await createChatResponse({
    apiKey: 'sk-test',
    agentId: 'mechanics',
    message: '最新版火首领机制有什么变化？',
    gameName: '示例角色扮演游戏'
  }, {
    researchClient: async () => ({
      checkedSources: ['bilibili', 'xiaoheihe'],
      searchQuery: '示例角色扮演游戏 最新版火首领机制有什么变化',
      sources: [],
      failures: ['B站搜索暂不可用']
    }),
    modelClient: async () => ({
      answer: '最新版火首领机制需要先核对资料，再调整走位和破盾节奏。',
      usage: { total_tokens: 20 }
    })
  });

  assert.equal(response.status, 'completed');
  assert.equal(response.confidence, 'low');
  assert.equal(response.needResearch, true);
  assert.equal(response.sources.length, 0);
  assert.equal(response.researchFailures.length > 0, true);
  assert.equal(response.harness.ok, true);
});

test('chief guide response lists specialist agents used', async () => {
  const response = await createChatResponse({
    apiKey: 'sk-test',
    agentId: 'chief',
    message: '我用当前队伍打不过火首领，应该怎么办？',
    gameName: '示例角色扮演游戏'
  }, {
    modelClient: async () => ({
      answer: '总控攻略代理建议先处理火首领机制，再根据当前队伍调整配装。',
      usage: { total_tokens: 24 }
    })
  });

  assert.equal(response.status, 'completed');
  assert.equal(response.agentId, 'chief');
  assert.deepEqual(response.usedAgents, ['research', 'mechanics', 'build', 'combat', 'critic']);
  assert.match(response.answer, /火首领/);
  assert.match(response.answer, /总控攻略代理/);
  assert.doesNotMatch(response.answer, /Recommended next step/);
  assert.equal(response.harness.ok, true);
});

test('chat response uses model client answer instead of local mock synthesis', async () => {
  let receivedApiKey = '';
  let receivedMessages = [];

  const response = await createChatResponse({
    apiKey: 'sk-user-input',
    agentId: 'chief',
    message: '我打不过火首领。',
    gameName: '示例角色扮演游戏'
  }, {
    modelClient: async ({ apiKey, messages }) => {
      receivedApiKey = apiKey;
      receivedMessages = messages;
      return {
        answer: '这是来自真实模型调用层的回答：先处理火首领护盾。',
        usage: { total_tokens: 18 }
      };
    }
  });

  assert.equal(receivedApiKey, 'sk-user-input');
  assert.equal(receivedMessages.some((message) => message.content.includes('我打不过火首领')), true);
  assert.equal(response.answer, '这是来自真实模型调用层的回答：先处理火首领护盾。');
  assert.equal(response.provider.usage.total_tokens, 18);
});

test('screenshot chat reuses the main Zhipu api key when no separate vision key is provided', async () => {
  let modelCalled = false;
  let visionCalled = false;

  const response = await createChatResponse({
    apiKey: 'sk-test',
    agentId: 'chief',
    message: '看一下这张装备截图我该怎么配装。',
    gameName: '示例角色扮演游戏',
    screenshot: {
      mediaType: 'image/png',
      data: 'iVBORw0KGgo='
    }
  }, {
    researchClient: async () => ({
      checkedSources: ['bilibili', 'xiaoheihe'],
      searchQuery: '示例角色扮演游戏 截图 配装',
      sources: [],
      failures: []
    }),
    modelClient: async ({ apiKey }) => {
      modelCalled = true;
      assert.equal(apiKey, 'sk-test');
      return { answer: '基于截图分析回答。', usage: { total_tokens: 10 } };
    },
    visionClient: async ({ apiKey }) => {
      visionCalled = true;
      assert.equal(apiKey, 'sk-test');
      return { summary: '截图显示角色需要调整配装。' };
    }
  });

  assert.equal(modelCalled, true);
  assert.equal(visionCalled, true);
  assert.equal(response.status, 'completed');
  assert.equal(response.intent, 'screenshot_question');
});

test('screenshot chat analyzes vision before research and text answer', async () => {
  const calls = [];
  let receivedResearchInput = null;
  let receivedMessages = [];

  const response = await createChatResponse({
    apiKey: 'sk-test',
    visionApiKey: 'sk-vision',
    agentId: 'chief',
    message: '看截图判断我该先刷什么。',
    gameName: '示例角色扮演游戏',
    screenshot: {
      mediaType: 'image/png',
      data: 'iVBORw0KGgo='
    }
  }, {
    visionClient: async ({ apiKey, screenshot, prompt }) => {
      calls.push('vision');
      assert.equal(apiKey, 'sk-vision');
      assert.equal(screenshot.mediaType, 'image/png');
      assert.match(prompt, /看截图判断/);
      return {
        summary: '截图显示体力不足，角色缺少突破材料。',
        observations: ['体力不足', '缺少突破材料'],
        model: 'gpt-4.1-mini'
      };
    },
    researchClient: async (input) => {
      calls.push('research');
      receivedResearchInput = input;
      return {
        checkedSources: ['bilibili', 'xiaoheihe'],
        searchQuery: '示例角色扮演游戏 体力不足 突破材料 刷取路线',
        sources: [{
          source: 'bilibili',
          title: '突破材料刷取路线',
          url: 'https://example.test/guide',
          summary: '先刷突破材料，再补抗性材料。',
          freshness: 'search-result'
        }],
        failures: []
      };
    },
    modelClient: async ({ messages }) => {
      calls.push('answer');
      receivedMessages = messages;
      return {
        answer: '先刷突破材料，再规划体力。',
        usage: { total_tokens: 42 }
      };
    }
  });

  assert.deepEqual(calls, ['vision', 'research', 'answer']);
  assert.equal(receivedResearchInput.gameName, '示例角色扮演游戏');
  assert.match(receivedResearchInput.query, /截图显示体力不足/);
  assert.match(receivedMessages.find((message) => message.role === 'user').content, /截图分析：截图显示体力不足/);
  assert.match(receivedMessages.find((message) => message.role === 'user').content, /突破材料刷取路线/);
  assert.equal(response.status, 'completed');
  assert.equal(response.intent, 'screenshot_question');
  assert.deepEqual(response.workflowStages, ['intent', 'vision', 'research', 'answer']);
  assert.equal(response.visionAnalysis.summary, '截图显示体力不足，角色缺少突破材料。');
  assert.equal(response.searchQuery, '示例角色扮演游戏 体力不足 突破材料 刷取路线');
});

test('text question always researches before answering', async () => {
  const calls = [];
  let receivedResearchInput = null;
  let receivedMessages = [];

  const response = await createChatResponse({
    apiKey: 'sk-test',
    agentId: 'chief',
    message: '火首领现在怎么打？',
    gameName: '示例角色扮演游戏'
  }, {
    researchClient: async (input) => {
      calls.push('research');
      receivedResearchInput = input;
      return {
        checkedSources: ['bilibili', 'xiaoheihe'],
        searchQuery: '示例角色扮演游戏 火首领现在怎么打',
        sources: [],
        failures: ['B站搜索暂不可用']
      };
    },
    modelClient: async ({ messages }) => {
      calls.push('answer');
      receivedMessages = messages;
      return {
        answer: '先核对版本，再处理火首领护盾。',
        usage: { total_tokens: 24 }
      };
    }
  });

  assert.deepEqual(calls, ['research', 'answer']);
  assert.equal(receivedResearchInput.query, '火首领现在怎么打？');
  assert.match(receivedMessages.find((message) => message.role === 'user').content, /搜索失败：B站搜索暂不可用/);
  assert.equal(response.intent, 'text_question');
  assert.deepEqual(response.workflowStages, ['intent', 'research', 'answer']);
  assert.deepEqual(response.researchFailures, ['B站搜索暂不可用']);
});
