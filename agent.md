# Game Guide Agent Lab 开发规范

## 项目身份

- 项目名称：Game Guide Agent Lab
- 包名：game-guide-agent-lab
- 当前目录：D:\workspace\develop\2026-07\game-guide-agent-lab
- 项目类型：游戏攻略多 Agent 工作流演示

## 当前范围

- 前端侧边栏收集 DeepSeek API Key 和游戏场景。
- 后端固定模型标识为 `deepseek-v4`。
- API Key 只用于请求校验，不落盘保存。
- 当前工作流使用 mock agent 输出展示研究、状态分析、配装规划、路线规划、战斗建议、审查、汇总和评分。
- 真实 DeepSeek 调用和实时研究能力属于后续实现范围。

## 开发规则

- 以当前项目的 `README.md`、`docs/`、`server/`、`web/` 为准，不沿用其他项目的业务上下文。
- 修改功能前先阅读相关 spec 或 plan，保持实现与 `docs/superpowers/` 下的设计一致。
- 后端改动优先补充或更新 `server/test/` 下的 Node test。
- 前端改动需要实际打开页面检查布局和交互。
- 完成改动前至少运行与改动相关的验证；通常使用 `npm test`。

## 运行命令

```powershell
npm test
npm start
```

开发服务默认地址：

```text
http://localhost:5177
```
