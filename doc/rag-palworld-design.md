# 智助侠 RAG 幻兽帕鲁实验版设计

## 目标

先在服务器部署一套轻量 RAG 服务，用于按游戏隔离存储攻略知识。第一批实验游戏为“幻兽帕鲁”，验证知识入库、查询召回和后续接入主聊天工作流的链路。

## 方案

- 运行位置：服务器 `/root/workspace/zhizhuxia-rag`
- 技术栈：Python 3.11 标准库，不安装第三方依赖
- 数据格式：`data/games/<gameId>/knowledge.jsonl`
- 当前游戏：`palworld`
- 检索方式：关键词/BM25 风格轻量评分，后续可替换为 embedding + 向量库
- HTTP 端口：`5188`
- 鉴权：`/api/rag/*` 需要 `Authorization: Bearer <ZHIZHUXIA_RAG_TOKEN>`

## API

- `GET /health`：返回服务状态和已加载游戏列表
- `POST /api/rag/query`：按 `gameId` 和 `query` 检索知识
- `POST /api/rag/upsert`：写入单条或多条知识片段

生产部署时必须设置环境变量 `ZHIZHUXIA_RAG_TOKEN`。未设置该变量时服务会进入开发兼容模式，不拦截本机测试请求。

## 边界

本阶段不直接接入当前 WPF 桌面端，也不改主 Node `/api/chat`。先把独立 RAG 服务跑通，下一步再让主后端在生成回答前调用 RAG。
