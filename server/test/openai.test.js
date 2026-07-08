import test from 'node:test';
import assert from 'node:assert/strict';
import { callZhipuVision } from '../src/zhipu.js';

test('calls Zhipu GLM-5.2 chat completions with base64 screenshot input', async () => {
  let capturedUrl = '';
  let capturedOptions = {};

  const result = await callZhipuVision({
    apiKey: 'sk-vision-input',
    prompt: '分析截图',
    screenshot: {
      mediaType: 'image/png',
      data: 'iVBORw0KGgo='
    },
    fetchImpl: async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        json: async () => ({
          model: 'gpt-4.1-mini',
          choices: [{
            message: {
              content: '截图显示角色体力不足。'
            }
          }],
          usage: { total_tokens: 30 }
        })
      };
    }
  });

  const body = JSON.parse(capturedOptions.body);
  const content = body.messages[0].content;

  assert.equal(capturedUrl, 'https://open.bigmodel.cn/api/paas/v4/chat/completions');
  assert.equal(capturedOptions.method, 'POST');
  assert.equal(capturedOptions.headers.authorization, 'Bearer sk-vision-input');
  assert.equal(body.model, 'glm-5.2');
  assert.equal(content[0].type, 'text');
  assert.equal(content[0].text, '分析截图');
  assert.equal(content[1].type, 'image_url');
  assert.equal(content[1].image_url.url, 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(result.summary, '截图显示角色体力不足。');
  assert.equal(result.usage.total_tokens, 30);
});

test('reports Zhipu vision failures without exposing the api key', async () => {
  await assert.rejects(
    () => callZhipuVision({
      apiKey: 'sk-secret-vision',
      prompt: '分析截图',
      screenshot: {
        mediaType: 'image/png',
        data: 'iVBORw0KGgo='
      },
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        text: async () => 'invalid key sk-secret-vision'
      })
    }),
    (error) => {
      assert.match(error.message, /智谱视觉接口请求失败：401/);
      assert.doesNotMatch(error.message, /sk-secret-vision/);
      return true;
    }
  );
});
