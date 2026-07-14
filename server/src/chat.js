import { MODEL_ID } from './config.js';
import { evaluateChatAnswer } from './harness.js';
import { normalizeImageInputs, normalizeScreenshotInput, resolveModelProfile } from './models.js';
import { runResearchQuery } from './research.js';
import { getPalworldMapTool, rankFromStrongToWeak } from './tools.js';
import { callZhipuChat, callZhipuVision } from './zhipu.js';

export const CHAT_AGENTS = [
  { id: 'chief', name: '总控攻略代理' },
  { id: 'research', name: '资料检索代理' },
  { id: 'mechanics', name: '机制分析代理' },
  { id: 'build', name: '配装建议代理' },
  { id: 'route', name: '路线规划代理' },
  { id: 'combat', name: '战斗教练代理' },
  { id: 'critic', name: '质量审查代理' }
];

const VALID_AGENT_IDS = new Set(CHAT_AGENTS.map((agent) => agent.id));
const AGENT_LABELS = Object.fromEntries(CHAT_AGENTS.map((agent) => [agent.id, agent.name]));
const SESSION_MEMORY_LIMIT = 60;
const sessionMemory = [];

export function resetSessionMemory() {
  sessionMemory.length = 0;
}

function isResumeCommand(message = '') {
  return /^\/resume(?:\s+.+)?$/i.test(String(message || '').trim());
}

function getResumeQuery(message = '') {
  return String(message || '').trim().replace(/^\/resume/i, '').trim();
}

function memoryText(entry) {
  return [entry.gameName, entry.message, entry.answer].filter(Boolean).join('\n').toLowerCase();
}

function scoreMemory(entry, query, gameName) {
  const text = memoryText(entry);
  const terms = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  let score = gameName && entry.gameName === gameName ? 2 : 0;
  for (const term of terms) {
    if (text.includes(term)) score += 3;
  }
  if (!terms.length) score += 1;
  return score;
}

function searchSessionMemory({ query, gameName }) {
  return sessionMemory
    .map((entry) => ({ entry, score: scoreMemory(entry, query, gameName) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.entry.createdAt - left.entry.createdAt)
    .slice(0, 3)
    .map((item) => item.entry);
}

function rememberSession({ gameName, agentId, message, response }) {
  if (!response?.answer || isResumeCommand(message)) return;
  sessionMemory.push({
    gameName,
    agentId,
    message,
    answer: response.answer,
    createdAt: Date.now()
  });
  while (sessionMemory.length > SESSION_MEMORY_LIMIT) {
    sessionMemory.shift();
  }
}

const AGENT_WORKFLOWS = {
  chief: {
    id: 'chief',
    ownerAgentId: 'chief',
    label: '总控规划工作流',
    researchKeywords: ['攻略', '路线', '机制', '配装'],
    researchFocus: '先扩展问题上下文，再综合多类资料给出总控建议。',
    answerPolicy: '先给结论，再拆成可执行步骤，并明确需要补充的信息。',
    stages: ['workflow:chief', 'research:chief', 'answer:chief', 'critic']
  },
  research: {
    id: 'research',
    ownerAgentId: 'research',
    label: '资料检索工作流',
    researchKeywords: ['最新攻略', '资料', '来源', '版本'],
    researchFocus: '优先检索来源、版本、发布时间和可核验资料。',
    answerPolicy: '先说明来源可靠性，再总结资料差异，不伪造来源。',
    stages: ['workflow:research', 'research:research', 'answer:research', 'critic']
  },
  mechanics: {
    id: 'mechanics',
    ownerAgentId: 'mechanics',
    label: '机制分析工作流',
    researchKeywords: ['机制', '阶段', '触发', '规则'],
    researchFocus: '优先查机制触发条件、阶段变化、数值规则和版本差异。',
    answerPolicy: '按触发条件、危险点、应对动作解释机制。',
    stages: ['workflow:mechanics', 'research:mechanics', 'answer:mechanics', 'critic']
  },
  build: {
    id: 'build',
    ownerAgentId: 'build',
    label: '配装工作流',
    researchKeywords: ['gear build', '配装', '装备', '武器', '队伍'],
    researchFocus: '优先查装备搭配、武器选择、角色定位和队伍协同。',
    answerPolicy: '按当前问题给出优先级、替代项、养成顺序和不推荐项。',
    stages: ['workflow:build', 'research:build', 'answer:build', 'critic']
  },
  route: {
    id: 'route',
    ownerAgentId: 'route',
    label: '路线规划工作流',
    researchKeywords: ['farming route', '路线', '材料', '日常', '效率'],
    researchFocus: '优先查材料位置、刷新周期、路线顺序和时间效率。',
    answerPolicy: '按起点、路径、优先级和替代路线输出。',
    stages: ['workflow:route', 'research:route', 'answer:route', 'critic']
  },
  combat: {
    id: 'combat',
    ownerAgentId: 'combat',
    label: '战斗教练工作流',
    researchKeywords: ['combat', 'boss', 'rotation', '战斗', '首领', '破盾'],
    researchFocus: '优先查首领机制、技能轴、输出窗口、破盾和走位。',
    answerPolicy: '按战前准备、战斗节奏、关键动作和失误修正输出。',
    stages: ['workflow:combat', 'research:combat', 'answer:combat', 'critic']
  },
  critic: {
    id: 'critic',
    ownerAgentId: 'critic',
    label: '质量审查工作流',
    researchKeywords: ['验证', '来源', '版本', '风险'],
    researchFocus: '优先核对来源、版本风险和回答中可能过度断言的部分。',
    answerPolicy: '指出不确定性、缺失来源和需要用户复核的点。',
    stages: ['workflow:critic', 'research:critic', 'answer:critic', 'critic']
  },
  general: {
    id: 'general',
    ownerAgentId: 'chief',
    label: '通用问答工作流',
    researchKeywords: ['攻略', '建议'],
    researchFocus: '先补齐上下文，再给通用攻略建议。',
    answerPolicy: '保持简洁，明确假设和下一步。',
    stages: ['workflow:general', 'research:general', 'answer:general', 'critic']
  },
  smalltalk: {
    id: 'smalltalk',
    ownerAgentId: 'chief',
    label: '闲聊接待工作流',
    researchKeywords: [],
    researchFocus: '不进行联网检索，只做简短接待和引导。',
    answerPolicy: '简短回应，并提示用户可以输入游戏问题或截图。',
    stages: ['workflow:smalltalk', 'answer:smalltalk']
  }
};

function knowledgeCheck(message = '') {
  const lower = message.toLowerCase();
  const patchSpecific = ['newest', 'latest', 'patch', 'version', 'changed', 'current', '最新版', '版本', '补丁'].some((word) => lower.includes(word));

  if (patchSpecific) {
    return {
      confidence: 'low',
      needResearch: true,
      reason: '这个问题可能依赖当前版本或补丁信息。'
    };
  }

  return {
    confidence: 'medium',
    needResearch: false,
    reason: '这个问题可以先基于通用攻略规划模式回答，并明确假设。'
  };
}

function selectChiefSpecialists(message = '', intentFunnel = null) {
  const lower = message.toLowerCase();
  const agents = ['research'];

  if (intentFunnel?.recommendedAgentId && intentFunnel.recommendedAgentId !== 'chief') {
    agents.push(intentFunnel.recommendedAgentId);
  }

  if (/boss|phase|mechanic|patch|changed|fire|首领|阶段|机制|版本|火/i.test(lower)) agents.push('mechanics');
  if (/team|build|gear|character|weapon|loadout|队伍|配装|装备|角色|武器/i.test(lower)) agents.push('build');
  if (/route|farm|daily|material|path|路线|刷|材料|日常/i.test(lower)) agents.push('route');
  if (/boss|fight|combat|rotation|phase|fire|首领|战斗|循环|阶段|火/i.test(lower)) agents.push('combat');

  agents.push('critic');
  const selected = new Set(agents);
  return ['research', 'mechanics', 'build', 'route', 'combat', 'critic'].filter((id) => selected.has(id));
}

function splitCandidateItems(value = '') {
  return String(value)
    .split(/\r?\n|,|，|、|\/|；|;/)
    .map((item) => item.replace(/^(帮我|把|给我|请|来个|做个|排一下|排名一下|对比一下)+/g, '').trim())
    .map((item) => item.replace(/^(和|跟|与)\s*/g, '').trim())
    .filter(Boolean);
}

export function identifyChatIntent(message = '') {
  const text = String(message || '').trim();
  const isRanking = /从夯到拉|夯到拉|排名|排行|强度榜|梯度|tier/i.test(text);

  if (!isRanking) {
    return { type: 'chat', items: [] };
  }

  const beforeRank = text
    .split(/从夯到拉|夯到拉|排名|排行|强度榜|梯度|tier/i)[0]
    .replace(/^(帮我|给我|请|来个|做个)\s*/g, '')
    .replace(/^把\s*/g, '');
  const items = splitCandidateItems(beforeRank);

  return {
    type: 'ranking',
    items,
    context: text
  };
}

const TASK_FUNNEL_RULES = [
  {
    type: 'build',
    recommendedAgentId: 'build',
    patterns: [/build/i, /gear/i, /weapon/i, /loadout/i, /team/i, /character/i, /equipment/i, /配装|装备|武器|队伍|角色/u]
  },
  {
    type: 'route',
    recommendedAgentId: 'route',
    patterns: [/route/i, /farm/i, /daily/i, /material/i, /path/i, /resource/i, /路线|刷|材料|日常/u]
  },
  {
    type: 'combat',
    recommendedAgentId: 'combat',
    patterns: [/boss/i, /fight/i, /combat/i, /rotation/i, /shield/i, /dodge/i, /parry/i, /首领|战斗|循环|破盾/u]
  },
  {
    type: 'mechanics',
    recommendedAgentId: 'mechanics',
    patterns: [/mechanic/i, /phase/i, /rule/i, /trigger/i, /patch/i, /version/i, /机制|阶段|版本|触发/u]
  },
  {
    type: 'research',
    recommendedAgentId: 'research',
    patterns: [/latest/i, /newest/i, /current/i, /guide/i, /source/i, /最新|攻略|资料/u]
  }
];

function matchTaskFunnel(message = '') {
  const text = String(message || '');
  for (const rule of TASK_FUNNEL_RULES) {
    const matched = rule.patterns.filter((pattern) => pattern.test(text));
    if (matched.length) {
      return {
        type: rule.type,
        recommendedAgentId: rule.recommendedAgentId,
        confidence: matched.length > 1 ? 'high' : 'medium',
        signals: matched.map((pattern) => pattern.source)
      };
    }
  }

  return {
    type: 'general',
    recommendedAgentId: 'chief',
    confidence: 'low',
    signals: []
  };
}

function isSmalltalkMessage(message = '') {
  return /^(你好|您好|在吗|嗨|哈喽|hello|hi|hey)[。！？!?\s.]*$/i.test(String(message || '').trim());
}

function isMeaninglessMessage(message = '') {
  const text = String(message || '').trim();
  if (!text) return false;
  if (/^\d+$/.test(text)) return true;
  if (text.length <= 1) return true;

  const knownSingleToken = /^(boss|build|gear|route|farm|daily|material|weapon|team|fight|help|guide|quest|map|artifact)$/i;
  if (/^[a-z]{6,16}$/i.test(text) && !knownSingleToken.test(text)) {
    return true;
  }

  return false;
}

function shouldUsePalworldMapTool({ gameName = '', message = '' } = {}) {
  const combined = `${gameName} ${message}`;
  const isPalworld = /palworld|幻兽帕鲁|帕鲁/i.test(combined);
  const asksMap = /map|location|where|coordinate|spawn|resource|ore|coal|sulfur|quartz|地图|位置|坐标|刷新|资源|矿|金属|煤|硫磺|石英|传送|宝箱|地下城|洞窟|首领/u.test(String(message || ''));
  return isPalworld && asksMap;
}

export function identifyWorkflowIntent({ message = '', screenshot = null }) {
  if (!screenshot && isSmalltalkMessage(message)) {
    return {
      type: 'smalltalk',
      items: [],
      inputType: 'text_question',
      taskType: 'smalltalk',
      executionType: 'chat_answer',
      recommendedAgentId: 'chief',
      confidence: 'high',
      layers: [
        { layer: 'input', type: 'text_question', confidence: 'high', signals: ['greeting'] },
        { layer: 'task', type: 'smalltalk', confidence: 'high', signals: ['smalltalk'] },
        { layer: 'execution', type: 'chat_answer', confidence: 'high', signals: ['answer'] }
      ]
    };
  }

  if (!screenshot && isMeaninglessMessage(message)) {
    return {
      type: 'rejected',
      items: [],
      inputType: 'text_question',
      taskType: 'rejected',
      executionType: 'reject',
      recommendedAgentId: 'chief',
      confidence: 'high',
      rejectionReason: '输入内容太短或缺少可识别的游戏问题，请补充具体目标、截图或上下文。',
      layers: [
        { layer: 'input', type: 'text_question', confidence: 'high', signals: ['low-information'] },
        { layer: 'task', type: 'rejected', confidence: 'high', signals: ['meaningless'] },
        { layer: 'execution', type: 'reject', confidence: 'high', signals: ['no-workflow'] }
      ]
    };
  }

  const ranking = identifyChatIntent(message);
  if (ranking.type === 'ranking') {
    return {
      ...ranking,
      inputType: 'ranking',
      taskType: 'ranking',
      executionType: 'rank',
      recommendedAgentId: 'critic',
      confidence: 'high',
      layers: [
        { layer: 'input', type: 'ranking', confidence: 'high', signals: ['ranking-keyword'] },
        { layer: 'task', type: 'ranking', confidence: 'high', signals: ['candidate-list'] },
        { layer: 'execution', type: 'rank', confidence: 'high', signals: ['rank-tool'] }
      ]
    };
  }

  const inputType = screenshot ? 'screenshot_question' : 'text_question';
  const task = matchTaskFunnel(message);
  const executionType = screenshot ? 'vision_research_answer' : 'research_answer';

  return {
    type: inputType,
    items: [],
    inputType,
    taskType: task.type,
    executionType,
    recommendedAgentId: task.recommendedAgentId,
    confidence: task.confidence,
    layers: [
      {
        layer: 'input',
        type: inputType,
        confidence: screenshot ? 'high' : 'medium',
        signals: screenshot ? ['screenshot'] : ['text']
      },
      {
        layer: 'task',
        type: task.type,
        confidence: task.confidence,
        signals: task.signals
      },
      {
        layer: 'execution',
        type: executionType,
        confidence: screenshot ? 'high' : 'medium',
        signals: screenshot ? ['vision', 'research', 'answer'] : ['research', 'answer']
      }
    ]
  };
}

function buildSearchQuery({ gameName, message, visionAnalysis }) {
  return [
    gameName,
    message,
    visionAnalysis?.summary || ''
  ].filter(Boolean).join(' ').trim();
}

function selectAgentWorkflow({ agentId, intentFunnel }) {
  if (agentId && !['chief', 'critic'].includes(agentId) && AGENT_WORKFLOWS[agentId]) {
    return AGENT_WORKFLOWS[agentId];
  }

  const workflowId = intentFunnel?.taskType && AGENT_WORKFLOWS[intentFunnel.taskType]
    ? intentFunnel.taskType
    : intentFunnel?.recommendedAgentId;

  return AGENT_WORKFLOWS[workflowId] || AGENT_WORKFLOWS[agentId] || AGENT_WORKFLOWS.general;
}

function serializeAgentWorkflow(workflow) {
  return {
    id: workflow.id,
    ownerAgentId: workflow.ownerAgentId,
    label: workflow.label,
    researchFocus: workflow.researchFocus,
    answerPolicy: workflow.answerPolicy,
    stages: workflow.stages
  };
}

function buildWorkflowSearchQuery({ gameName, message, visionAnalysis, workflow }) {
  return [
    buildSearchQuery({ gameName, message, visionAnalysis }),
    ...(workflow?.researchKeywords || [])
  ].filter(Boolean).join(' ').trim();
}

function buildMessages({ agentId, message, gameName, check, sources, failures, usedAgents, modelProfile, images, visionAnalysis, intentFunnel, agentWorkflow, toolCards = [] }) {
  const sourceText = sources.length
    ? sources.map((source) => `- ${source.source}：${source.title}。${source.summary}`).join('\n')
    : '没有外部来源卡片。';
  const failureText = failures?.length ? failures.join('；') : '无';
  const toolText = toolCards.length
    ? toolCards.map((card) => `- ${card.source}: ${card.title}. ${card.summary} ${card.url}`).join('\n')
    : '无';
  const userText = [
    toolCards.length ? `地图工具卡：\n${toolText}` : '',
    `游戏：${gameName || '未提供'}`,
    `用户问题：${message}`,
    intentFunnel ? `意图漏斗：${intentFunnel.inputType} -> ${intentFunnel.taskType} -> ${intentFunnel.executionType}` : '',
    visionAnalysis?.summary ? `截图分析：${visionAnalysis.summary}` : '',
    visionAnalysis?.observations?.length ? `截图观察：${visionAnalysis.observations.join('；')}` : '',
    `知识判断：置信度 ${check.confidence}；是否需要检索资料：${check.needResearch ? '是' : '否'}；原因：${check.reason}`,
    `来源卡片：\n${sourceText}`,
    `搜索失败：${failureText}`,
    images.length ? `视觉输入：用户附带 ${images.length} 张图片，请结合图片内容分析。` : '',
    '请给出一段适合聊天窗口展示的攻略回答。'
  ].filter(Boolean).join('\n');
  const userContent = images.length
    ? [
        { type: 'text', text: userText },
        ...images.map((image) => ({
          type: 'image',
          mediaType: image.mediaType,
          data: image.data
        }))
      ]
    : userText;

  return [
    {
      role: 'system',
      content: [
        '你是本地部署的游戏攻略多代理助手。',
        `当前模型：${modelProfile.id}。`,
        `当前代理：${AGENT_LABELS[agentId] || agentId}。`,
        `参与代理：${usedAgents.map((id) => AGENT_LABELS[id] || id).join('、')}。`,
        agentWorkflow ? `当前工作流：${agentWorkflow.label}。` : '',
        agentWorkflow ? `检索重点：${agentWorkflow.researchFocus}` : '',
        agentWorkflow ? `回答策略：${agentWorkflow.answerPolicy}` : '',
        '请用中文回答，不要使用英文界面词。',
        '如果信息可能过期，请说明不确定性。',
        '回答要具体、可执行，避免空泛建议。',
        '不要输出用户密钥或任何密钥片段。'
      ].join('\n')
    },
    {
      role: 'user',
      content: userContent
    }
  ];
}

export async function createChatResponse(input = {}, {
  modelClient = callZhipuChat,
  visionClient = callZhipuVision,
  researchClient = runResearchQuery,
  rankTool = rankFromStrongToWeak,
  mapTool = getPalworldMapTool
} = {}) {
  const apiKey = String(input.apiKey || '').trim();
  const visionApiKey = String(input.visionApiKey || '').trim();
  const effectiveVisionApiKey = visionApiKey || apiKey;
  const agentId = input.agentId || 'chief';
  const message = String(input.message || '').trim();
  const gameName = String(input.gameName || '').trim();
  const modelProfile = resolveModelProfile(String(input.modelId || MODEL_ID).trim());
  const images = normalizeImageInputs(input.images);
  const screenshot = normalizeScreenshotInput(input.screenshot) || images[0] || null;
  const intent = identifyWorkflowIntent({ message, screenshot });
  const intentFunnel = {
    inputType: intent.inputType,
    taskType: intent.taskType,
    executionType: intent.executionType,
    recommendedAgentId: intent.recommendedAgentId,
    confidence: intent.confidence,
    rejectionReason: intent.rejectionReason,
    layers: intent.layers
  };
  const errors = [];

  if (!apiKey) errors.push('API key is required');
  if (!VALID_AGENT_IDS.has(agentId)) errors.push('Selected agent is invalid');
  if (!message) errors.push('Message is required');

  if (errors.length) {
    return {
      status: 'failed',
      errors,
      intent: intent.type,
      intentFunnel,
      model: modelProfile.id,
      modelCapabilities: modelProfile.capabilities,
      imagesUsed: screenshot ? 1 : 0,
      workflowStages: ['intent']
    };
  }

  if (isResumeCommand(message)) {
    const resumeQuery = getResumeQuery(message);
    const matches = searchSessionMemory({ query: resumeQuery, gameName });
    const answer = matches.length
      ? [
          `找到 ${matches.length} 条会话记忆：`,
          ...matches.map((entry, index) => [
            `${index + 1}. ${entry.gameName || '未指定游戏'} / ${entry.agentId}`,
            `问题：${entry.message}`,
            `结论：${entry.answer}`
          ].join('\n'))
        ].join('\n\n')
      : `没有找到匹配“${resumeQuery || '最近会话'}”的会话记忆。`;

    return {
      status: 'completed',
      model: modelProfile.id,
      intent: 'resume',
      intentFunnel: {
        inputType: 'text_question',
        taskType: 'resume',
        executionType: 'memory',
        recommendedAgentId: 'chief',
        confidence: 'high',
        layers: [
          { layer: 'input', type: 'text_question', confidence: 'high', signals: ['slash-command'] },
          { layer: 'task', type: 'resume', confidence: 'high', signals: ['session-memory'] },
          { layer: 'execution', type: 'memory', confidence: 'high', signals: ['local-memory'] }
        ]
      },
      agentId,
      confidence: matches.length ? 'high' : 'low',
      needResearch: false,
      knowledgeCheck: {
        confidence: matches.length ? 'high' : 'low',
        needResearch: false,
        reason: '通过 /resume 查找当前服务进程内的会话记忆。'
      },
      usedAgents: ['chief'],
      sources: [],
      toolCards: [],
      researchFailures: [],
      checkedSources: [],
      searchQuery: resumeQuery,
      visionAnalysis: null,
      workflowStages: ['intent', 'memory'],
      answer,
      modelCapabilities: modelProfile.capabilities,
      imagesUsed: 0,
      provider: {
        model: modelProfile.id,
        usage: null
      },
      harness: {
        ok: true,
        warnings: []
      }
    };
  }

  if (intent.type === 'rejected') {
    return {
      status: 'failed',
      errors: [intent.rejectionReason],
      intent: intent.type,
      intentFunnel,
      model: modelProfile.id,
      modelCapabilities: modelProfile.capabilities,
      imagesUsed: 0,
      workflowStages: ['intent']
    };
  }

  if (intent.type === 'ranking' && intent.items.length >= 2) {
    const rankResult = await rankTool({
      apiKey,
      gameName,
      context: intent.context,
      items: intent.items
    });

    if (rankResult.status === 'failed') {
      return rankResult;
    }

    const response = {
      status: 'completed',
      intent: 'ranking',
      intentFunnel,
      model: modelProfile.id,
      agentId,
      confidence: 'high',
      needResearch: false,
      knowledgeCheck: {
        confidence: 'high',
        needResearch: false,
        reason: '已识别为排名意图，自动调用从夯到拉工具。'
      },
      usedAgents: ['critic'],
      sources: [],
      toolCards: [],
      researchFailures: [],
      answer: rankResult.markdown,
      provider: rankResult.provider || {
        model: modelProfile.id,
        usage: null
      },
      modelCapabilities: modelProfile.capabilities,
      imagesUsed: screenshot ? 1 : 0,
      workflowStages: ['intent', 'rank']
    };

    response.harness = evaluateChatAnswer({
      apiKey,
      selectedAgent: agentId,
      message,
      response
    });

    rememberSession({ gameName, agentId, message, response });
    return response;
  }

  if (intent.type === 'smalltalk') {
    const check = {
      confidence: 'high',
      needResearch: false,
      reason: '识别为闲聊接待，不需要联网检索。'
    };
    const agentWorkflow = selectAgentWorkflow({ agentId, intentFunnel });
    const activeWorkflow = serializeAgentWorkflow(agentWorkflow);
    const usedAgents = agentId === 'chief' ? ['chief'] : [agentId];
    const workflowStages = ['intent', 'answer'];
    const messages = buildMessages({
      agentId,
      message,
      gameName,
      check,
      sources: [],
      failures: [],
      usedAgents,
      modelProfile,
      images: [],
      visionAnalysis: null,
      intentFunnel,
      agentWorkflow: activeWorkflow
    });

    let modelResult;
    try {
      modelResult = await modelClient({ apiKey, model: modelProfile.id, messages, modelProfile });
    } catch (error) {
      return {
        status: 'failed',
        errors: [error.message],
        intent: intent.type,
        intentFunnel
      };
    }

    const response = {
      status: 'completed',
      model: modelProfile.id,
      intent: intent.type,
      intentFunnel,
      activeWorkflow,
      agentWorkflowStages: activeWorkflow.stages,
      agentId,
      confidence: check.confidence,
      needResearch: false,
      knowledgeCheck: check,
      usedAgents,
      sources: [],
      toolCards: [],
      researchFailures: [],
      checkedSources: [],
      searchQuery: '',
      visionAnalysis: null,
      workflowStages,
      answer: modelResult.answer,
      modelCapabilities: modelProfile.capabilities,
      imagesUsed: 0,
      provider: {
        model: modelResult.model || modelProfile.id,
        usage: modelResult.usage || null
      }
    };

    response.harness = evaluateChatAnswer({
      apiKey,
      selectedAgent: agentId,
      message,
      response
    });

    return response;
  }

  const check = knowledgeCheck(message);
  const agentWorkflow = selectAgentWorkflow({ agentId, intentFunnel });
  const activeWorkflow = serializeAgentWorkflow(agentWorkflow);
  const usedAgents = agentId === 'chief' ? selectChiefSpecialists(message, intentFunnel) : [agentId];
  const workflowStages = ['intent'];
  let visionAnalysis = null;
  let toolCards = [];

  if (screenshot) {
    workflowStages.push('vision');
    try {
      visionAnalysis = await visionClient({
        apiKey: effectiveVisionApiKey,
        screenshot,
        prompt: [
          `游戏：${gameName || '未提供'}`,
          `用户问题：${message}`,
          '请分析截图中的游戏界面、资源、角色状态、任务目标和可执行建议。'
        ].join('\n')
      });
    } catch (error) {
      return {
        status: 'failed',
        errors: [error.message],
        intent: intent.type,
        intentFunnel,
        model: modelProfile.id,
        modelCapabilities: modelProfile.capabilities,
        imagesUsed: 1,
        workflowStages
      };
    }
  }

  if (shouldUsePalworldMapTool({ gameName, message })) {
    workflowStages.push('map-tool');
    const mapResult = await mapTool({
      gameName,
      query: message,
      intentFunnel
    });
    if (mapResult.status === 'completed' && Array.isArray(mapResult.cards)) {
      toolCards = mapResult.cards;
    }
  }

  workflowStages.push('research');
  const requestedSearchQuery = buildWorkflowSearchQuery({ gameName, message, visionAnalysis, workflow: agentWorkflow });
  const research = await researchClient({
    gameName,
    message,
    query: visionAnalysis?.summary ? `${message}\n截图分析：${visionAnalysis.summary}` : message,
    searchQuery: requestedSearchQuery,
    agentId,
    intent: intent.type,
    intentFunnel,
    agentWorkflow: activeWorkflow,
    visionAnalysis
  });
  const searchQuery = research.searchQuery || requestedSearchQuery;
  const messages = buildMessages({
    agentId,
    message,
    gameName,
    check,
    sources: research.sources,
    failures: research.failures,
    usedAgents,
    modelProfile,
    images: [],
    visionAnalysis,
    intentFunnel,
    agentWorkflow: activeWorkflow,
    toolCards
  });

  let modelResult;
  try {
    workflowStages.push('answer');
    modelResult = await modelClient({ apiKey, model: modelProfile.id, messages, modelProfile });
  } catch (error) {
    return {
      status: 'failed',
      errors: [error.message]
    };
  }

  const response = {
    status: 'completed',
    model: modelProfile.id,
    intent: intent.type,
    intentFunnel,
    activeWorkflow,
    agentWorkflowStages: activeWorkflow.stages,
    agentId,
    confidence: check.confidence,
    needResearch: check.needResearch,
    knowledgeCheck: check,
    usedAgents,
    sources: research.sources,
    toolCards,
    researchFailures: research.failures,
    checkedSources: research.checkedSources || [],
    searchQuery,
    visionAnalysis,
    workflowStages,
    answer: modelResult.answer,
    modelCapabilities: modelProfile.capabilities,
    imagesUsed: screenshot ? 1 : 0,
    provider: {
      model: modelResult.model || modelProfile.id,
      usage: modelResult.usage || null
    }
  };

  response.harness = evaluateChatAnswer({
    apiKey,
    selectedAgent: agentId,
    message,
    response
  });

  rememberSession({ gameName, agentId, message, response });
  return response;
}
