import { MODEL_ID } from './config.js';
import { callZhipuChat } from './zhipu.js';

function normalizeItems(items = []) {
  if (Array.isArray(items)) {
    return items.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(items)
    .split(/\r?\n|,|，/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseToolArguments(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  return JSON.parse(String(value));
}

function safeText(value) {
  return String(value ?? '').trim();
}

export class RankFromStrongToWeakTool {
  static name = 'rank_from_strong_to_weak';

  static definition = {
    type: 'function',
    function: {
      name: RankFromStrongToWeakTool.name,
      description: '把游戏候选项按“从夯到拉”排序，并给出简短理由。',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '结果标题，默认使用“从夯到拉排名”。'
          },
          summary: {
            type: 'string',
            description: '一句话总结整体排名判断。'
          },
          rankedItems: {
            type: 'array',
            description: '已经按强到弱排好的候选项。',
            items: {
              type: 'object',
              properties: {
                rank: { type: 'integer', description: '排名，从 1 开始。' },
                name: { type: 'string', description: '候选项名称。' },
                tier: { type: 'string', description: '强度档位，例如夯、中、拉。' },
                reason: { type: 'string', description: '简短排名理由。' }
              },
              required: ['rank', 'name', 'tier', 'reason']
            }
          },
          note: {
            type: 'string',
            description: '使用提醒或限制条件。'
          }
        },
        required: ['title', 'summary', 'rankedItems']
      }
    }
  };

  execute(args = {}) {
    const title = safeText(args.title) || '从夯到拉排名';
    const summary = safeText(args.summary);
    const rankedItems = Array.isArray(args.rankedItems) ? args.rankedItems : [];
    const note = safeText(args.note);
    const lines = [`## ${title}`];

    if (summary) {
      lines.push('', summary);
    }

    if (rankedItems.length) {
      lines.push('');
      for (const [index, item] of rankedItems.entries()) {
        const rank = Number.isFinite(Number(item.rank)) ? Number(item.rank) : index + 1;
        const name = safeText(item.name) || `候选项 ${rank}`;
        const tier = safeText(item.tier) || '未定';
        const reason = safeText(item.reason) || '模型未给出理由。';
        lines.push(`${rank}. **${name}**（${tier}）：${reason}`);
      }
    }

    if (note) {
      lines.push('', `注意：${note}`);
    }

    return {
      markdown: lines.join('\n'),
      rankedItems
    };
  }
}

function findRankToolCall(toolCalls = []) {
  return toolCalls.find((toolCall) => toolCall?.function?.name === RankFromStrongToWeakTool.name);
}

export async function rankFromStrongToWeak(input = {}, { modelClient = callZhipuChat } = {}) {
  const apiKey = String(input.apiKey || '').trim();
  const gameName = String(input.gameName || '').trim();
  const context = String(input.context || '').trim();
  const items = normalizeItems(input.items);
  const errors = [];

  if (!apiKey) errors.push('API key is required');
  if (items.length < 2) errors.push('至少输入两个候选项');

  if (errors.length) {
    return { status: 'failed', errors };
  }

  const messages = [
    {
      role: 'system',
      content: [
        '你是游戏攻略里的强度排名工具。',
        '必须调用 rank_from_strong_to_weak 工具返回结构化排名，不要直接输出长文本。',
        '“夯”表示强、好用、优先级高；“拉”表示弱、不推荐、优先级低。',
        '理由要短，结论要能直接渲染成中文 Markdown。',
        '不要输出用户密钥或任何密钥片段。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `游戏：${gameName || '未提供'}`,
        `场景：${context || '未提供'}`,
        `候选项：${items.join('、')}`,
        '请生成“从夯到拉排名”。'
      ].join('\n')
    }
  ];

  let modelResult;
  try {
    modelResult = await modelClient({
      apiKey,
      model: MODEL_ID,
      messages,
      tools: [RankFromStrongToWeakTool.definition],
      toolChoice: {
        type: 'function',
        function: { name: RankFromStrongToWeakTool.name }
      }
    });
  } catch (error) {
    return {
      status: 'failed',
      errors: [error.message]
    };
  }

  const toolCall = findRankToolCall(modelResult.toolCalls);
  let rendered;

  if (toolCall) {
    try {
      const args = parseToolArguments(toolCall.function.arguments);
      rendered = new RankFromStrongToWeakTool().execute(args);
    } catch (error) {
      return {
        status: 'failed',
        errors: [`排名工具参数解析失败：${error.message}`]
      };
    }
  } else {
    rendered = {
      markdown: modelResult.answer,
      rankedItems: []
    };
  }

  return {
    status: 'completed',
    tool: 'rank-from-strong-to-weak',
    model: MODEL_ID,
    markdown: rendered.markdown,
    items,
    rankedItems: rendered.rankedItems,
    provider: {
      model: modelResult.model || MODEL_ID,
      usage: modelResult.usage || null
    }
  };
}
