# Game Guide Chat Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Game Guide Agent Lab from a form-based guide generator into a local side-panel chat assistant with API-key login, agent selection, research-aware responses, and harness warnings.

**Architecture:** Keep the existing dependency-free Node.js backend and static frontend. Add focused backend modules for chat orchestration and research adapters, extend the existing harness with chat-answer checks, and replace the first screen with an in-memory API-key login plus chat workspace. Keep `/api/runs` compatible while making `/api/chat` the primary UI path.

**Tech Stack:** Node.js built-in `http`, `node:test`, static HTML/CSS/JavaScript.

---

## File Structure

- Create: `server/src/research.js` - deterministic Bilibili-first, Xiaoheihe-second research adapter for the local demo.
- Create: `server/src/chat.js` - chat request validation, knowledge checks, specialist selection, response synthesis, and harness integration.
- Modify: `server/src/harness.js` - add `evaluateChatAnswer`.
- Modify: `server/src/server.js` - add `POST /api/chat` and `POST /api/research`.
- Modify: `web/index.html` - replace form-first UI with login window and chat workspace.
- Modify: `web/app.js` - store API key in memory, send chat requests, render messages, source cards, and warnings.
- Modify: `web/styles.css` - style compact login and chat side panel.
- Create/Modify tests under `server/test/` for chat, research, API, and frontend source behavior.

## Task 1: Backend Chat Contracts

**Files:**
- Create: `server/test/chat.test.js`
- Create: `server/src/chat.js`
- Modify: `server/src/harness.js`

- [ ] Step 1: Add failing tests for API key validation, agent validity, chief-agent specialist usage, and low-confidence research behavior.
- [ ] Step 2: Run `npm test -- server/test/chat.test.js` and confirm failure because `server/src/chat.js` does not exist.
- [ ] Step 3: Implement `createChatResponse(input)` and `evaluateChatAnswer(payload)` with deterministic local behavior.
- [ ] Step 4: Run `npm test -- server/test/chat.test.js` and confirm pass.

## Task 2: Research Adapter

**Files:**
- Create: `server/test/research.test.js`
- Create: `server/src/research.js`

- [ ] Step 1: Add failing tests that research queries prioritize `bilibili` before `xiaoheihe` and return source-card-shaped results.
- [ ] Step 2: Run `npm test -- server/test/research.test.js` and confirm failure because the adapter does not exist.
- [ ] Step 3: Implement `runResearchQuery({ gameName, message, agentId })` returning deterministic source cards or clear failure metadata.
- [ ] Step 4: Run `npm test -- server/test/research.test.js` and confirm pass.

## Task 3: HTTP API

**Files:**
- Modify: `server/test/server.test.js`
- Modify: `server/src/server.js`

- [ ] Step 1: Add failing tests for `POST /api/chat` and `POST /api/research`.
- [ ] Step 2: Run `npm test -- server/test/server.test.js` and confirm missing-route failure.
- [ ] Step 3: Wire `createChatResponse` and `runResearchQuery` into the server while preserving `/api/runs`.
- [ ] Step 4: Run `npm test -- server/test/server.test.js` and confirm pass.

## Task 4: Frontend Chat Workspace

**Files:**
- Modify: `server/test/frontend.test.js`
- Modify: `web/index.html`
- Modify: `web/app.js`
- Modify: `web/styles.css`

- [ ] Step 1: Add failing static tests for login screen, no username/password fields, chat form, agent selector, settings panel, `/api/chat` usage, in-memory API key, and source/warning rendering.
- [ ] Step 2: Run `npm test -- server/test/frontend.test.js` and confirm failure against the existing form UI.
- [ ] Step 3: Implement the login-first chat UI, settings update flow, sample prompt, message rendering, source cards, harness warnings, and selected-agent requests.
- [ ] Step 4: Run `npm test -- server/test/frontend.test.js` and confirm pass.

## Task 5: Final Verification

**Files:**
- Modify only if verification exposes defects.

- [ ] Step 1: Run `npm test`.
- [ ] Step 2: Run `node --check server/src/server.js`.
- [ ] Step 3: Run `node --check server/src/chat.js`.
- [ ] Step 4: Run `node --check server/src/research.js`.
- [ ] Step 5: Start `npm start` and open `http://localhost:5177` for a visual smoke test if the port is available.

## Self-Review

- Spec coverage: API-key login, no account fields, in-memory key, settings update, `deepseek-v4`, Bilibili-first research, Xiaoheihe fallback, chief/specialist agents, chat endpoint, research endpoint, source cards, and harness warnings are covered.
- Placeholder scan: no TBD/TODO placeholders are intentionally left.
- Type consistency: chat payloads use `apiKey`, `agentId`, `message`, `gameName`, `confidence`, `needResearch`, `usedAgents`, `sources`, `answer`, and `harness`.
