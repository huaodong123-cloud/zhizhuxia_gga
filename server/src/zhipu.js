import { ZHIPU_CHAT_URL, ZHIPU_VISION_MODEL } from './config.js';

function sanitizeErrorText(value) {
  return String(value || '')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[已隐藏密钥]')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9._-]+/g, '[已隐藏密钥]');
}

export async function callZhipuVision({
  apiKey,
  screenshot,
  prompt,
  model = ZHIPU_VISION_MODEL,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!fetchImpl) {
    throw new Error('当前运行环境不支持网络请求');
  }

  const imageUrl = `data:${screenshot.mediaType};base64,${screenshot.data}`;
  const response = await fetchImpl(ZHIPU_CHAT_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }]
    })
  });

  if (!response.ok) {
    const bodyText = typeof response.text === 'function' ? await response.text() : '';
    throw new Error(`智谱视觉接口请求失败：${response.status} ${sanitizeErrorText(bodyText).slice(0, 240)}`.trim());
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  const summary = typeof content === 'string'
    ? content.trim()
    : Array.isArray(content)
      ? content.map((part) => part.text || '').join('').trim()
      : '';

  if (!summary) {
    throw new Error('智谱视觉接口没有返回可用分析');
  }

  return {
    summary,
    observations: [],
    model: payload.model || model,
    usage: payload.usage || null
  };
}

export async function callZhipuChat({
  apiKey,
  messages,
  model = ZHIPU_VISION_MODEL,
  tools,
  toolChoice,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!fetchImpl) {
    throw new Error('当前运行环境不支持网络请求');
  }

  const body = {
    model,
    messages
  };

  if (tools) {
    body.tools = tools;
  }

  if (toolChoice) {
    body.tool_choice = toolChoice;
  }

  const response = await fetchImpl(ZHIPU_CHAT_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const bodyText = typeof response.text === 'function' ? await response.text() : '';
    throw new Error(`智谱文本接口请求失败：${response.status} ${sanitizeErrorText(bodyText).slice(0, 240)}`.trim());
  }

  const payload = await response.json();
  const message = payload.choices?.[0]?.message || {};
  const content = message.content;
  const answer = typeof content === 'string'
    ? content.trim()
    : Array.isArray(content)
      ? content.map((part) => part.text || '').join('').trim()
      : '';

  return {
    answer,
    toolCalls: message.tool_calls || message.toolCalls || [],
    model: payload.model || model,
    usage: payload.usage || null
  };
}
