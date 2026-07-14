# Palworld RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a lightweight RAG service for per-game knowledge storage, starting with Palworld.

**Architecture:** A standalone Python 3.11 HTTP service stores game knowledge as JSONL and retrieves relevant chunks with deterministic keyword scoring. The service runs on the Aliyun host under `/root/workspace/zhizhuxia-rag` and exposes JSON APIs that the existing Node backend can call later.

**Tech Stack:** Python 3.11 standard library, JSONL files, systemd optional later.

---

### Task 1: Local RAG Service

**Files:**
- Create: `rag/rag_service.py`
- Create: `rag/data/games/palworld/knowledge.jsonl`
- Test: `rag/test_rag_service.py`

- [ ] Write deterministic tokenizer, store, query, and HTTP handlers.
- [ ] Seed Palworld knowledge with a few practical records.
- [ ] Add unittest coverage for query, upsert, and error handling.
- [ ] Run `python -m unittest rag.test_rag_service`.

### Task 2: Remote Deployment

**Files:**
- Deploy directory: `/root/workspace/zhizhuxia-rag`

- [ ] Copy `rag/` contents to the server.
- [ ] Start service with `nohup python3 rag_service.py --host 0.0.0.0 --port 5188`.
- [ ] Verify `GET /health`.
- [ ] Verify `POST /api/rag/query` for Palworld.
