import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_ID } from '../src/config.js';
import { callZhipuChat } from '../src/zhipu.js';

test('calls Zhipu GLM-5.2 chat completions with user api key', async () => {
  let capturedUrl = '';
  let capturedOptions = {};

  const result = await callZhipuChat({
    apiKey: 'sk-user-input',
    messages: [{ role: 'user', content: '你好' }],
    tools: [{
      type: 'function',
      function: {
        name: 'rank_from_strong_to_weak',
        parameters: { type: 'object', properties: {} }
      }
    }],
    fetchImpl: async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        json: async () => ({
          model: MODEL_ID,
          choices: [{ message: { content: '真实模型回答' } }],
          usage: { total_tokens: 12 }
        })
      };
    }
  });

  assert.equal(capturedUrl, 'https://open.bigmodel.cn/api/paas/v4/chat/completions');
  assert.equal(capturedOptions.method, 'POST');
  assert.equal(capturedOptions.headers.authorization, 'Bearer sk-user-input');
  assert.equal(JSON.parse(capturedOptions.body).model, MODEL_ID);
  assert.equal(JSON.parse(capturedOptions.body).tools[0].function.name, 'rank_from_strong_to_weak');
  assert.equal(result.answer, '真实模型回答');
  assert.equal(result.usage.total_tokens, 12);
});

test('reports Zhipu chat api failures without exposing the api key', async () => {
  await assert.rejects(
    () => callZhipuChat({
      apiKey: 'sk-secret-value',
      messages: [{ role: 'user', content: '你好' }],
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        text: async () => 'invalid key sk-secret-value'
      })
    }),
    (error) => {
      assert.match(error.message, /智谱文本接口请求失败：401/);
      assert.doesNotMatch(error.message, /sk-secret-value/);
      return true;
    }
  );
});
