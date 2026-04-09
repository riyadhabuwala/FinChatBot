# FinChatBot — Full Codebase Audit Report

> **Scope:** Parts 1–4 (React Frontend, Node.js API Gateway, Python RAG Engine, LangGraph Agentic Mode)
> **Date:** 2026-04-09
> **Files inspected:** 60+ across all three service layers

---

## Executive Summary

The project has a solid architectural skeleton — three independent services (React → Node → Python) with clear separation of concerns. However, there are **32 distinct issues** ranging from critical runtime bugs to structural problems that will compound as Part 5 is added. The most urgent issues are around the **agentic mode hallucination problem**, **cross-document RAG contamination**, and several **crash-path bugs** in the backend.

---

## 🔴 CRITICAL — Will Break at Runtime

### C1. Agentic Mode Hallucination — No Document Scope Isolation

**Files:** [agent.js](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/src/routes/agent.js), [vector_store.py](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/python_rag/app/rag/vector_store.py), [bm25_store.py](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/python_rag/app/rag/bm25_store.py)

This is the **root cause of your hallucination problem**. The FAISS and BM25 indexes are per-`user_id`, not per-document. When you upload File A, then upload File B, **both files' chunks live in the same index**. Any query retrieves chunks from *all* previously-uploaded documents.

- `vector_store.py:add_to_index()` (line 34): appends new chunks to the user's single FAISS index. There is no "replace" or "clear old file" logic.
- `bm25_store.py:add_to_bm25()` (line 19): same problem — appends to a single BM25 pickle per user.
- `vector_store.py:search_index()` (line 48): filters by `file_ids` during search, but **only if `file_ids` is non-empty**. If the frontend sends `[]` or doesn't filter correctly, it returns chunks from all documents.

**Impact:** The agent sees context from a *previously uploaded* document mixed in with the *current* document. This is why "considering data from prev uploaded document" is happening.

**Fix direction:**
1. On re-upload or new session, clear old chunks for the same `file_id` before adding new ones
2. Enforce `file_ids` filtering at every retrieval point — never return "all"
3. Consider per-file-id sub-indexes instead of a single monolithic index per user

---

### C2. `report_chunk` SSE Sends Accumulated Text, Not Delta

**Files:** [agent.js](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/src/routes/agent.js#L196-L202), [AgenticMode.jsx](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/src/components/modes/AgenticMode.jsx#L213-L217)

In the **Groq fallback path** (agent.js line 199), `streamChatResponse` calls `onChunk(accumulatedText)` — i.e., the full text so far. This value is then sent as `report_chunk.text`. But the frontend handler at AgenticMode.jsx line 215 does:
```js
setFinalOutput((prev) => prev + data.text);
```
This **concatenates the full accumulated text** to whatever was there before, producing **exponentially duplicated output**. After 3 chunks of "A", "A B", "A B C", the final output would be "AA BA B C" instead of "A B C".

When the **Python path** is used (writer.py line 41), `report_chunk` correctly sends `{"text": delta}` (just the new token). So the frontend's `prev + data.text` works correctly only for the Python path.

**Impact:** In fallback mode, the agent report output is garbled/duplicated.

**Fix:** In the Groq fallback path, change the onChunk callback to send only the delta, not the full accumulated text. Or change the frontend to replace instead of append.

---

### C3. `clearChat` Crashes When No Auth Token — `req.user` is `undefined`

**File:** [chat.js](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/src/routes/chat.js#L162-L172)

```js
router.post('/clear', optionalAuth, async (req, res) => {
  const { mode } = req.body;
  ...
  await clearSessionHistory(req.user.id, mode);  // line 168
```

The `optionalAuth` middleware sets `req.user = { id: 'demo', ... }` if no token, BUT the endpoint accesses `req.user.id` directly. This works fine — however, the **chat history route** at line 181 and the **upload files GET** route at upload.js line 151 do the same `req.user.id` access. If Express 5 somehow doesn't call the middleware, any of these will throw `Cannot read property 'id' of undefined`.

More critically, the **agent route** (agent.js line 13) uses `req.user?.id || 'demo'` (with optional chaining), but the chat route does NOT — it's inconsistent defensive coding.

---

### C4. `agentLimiter` Declared but Never Used

**File:** [rateLimit.js](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/src/middleware/rateLimit.js#L31-L43), [agent.js](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/src/routes/agent.js#L11)

The `agentLimiter` is exported from rateLimit.js but **never applied** to the agent route. The agent route at agent.js line 11 has no rate limiting middleware at all: `router.post('/run', async (req, res) => {...}`.

**Impact:** Agent runs (which are expensive — 4+ Groq API calls each) have no rate limiting. A single user can spam agent runs and burn through your Groq quota.

---

### C5. `initSSE` in Agent Route Called Without `req` — CORS Headers Missing

**File:** [agent.js](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/src/routes/agent.js#L76)

```js
initSSE(res);  // line 76 — missing `req` argument!
```

Compare with chat.js line 28: `initSSE(res, req)`. The SSE utility at sse.js uses `req?.headers?.origin` to set the `Access-Control-Allow-Origin` header. Without `req`, the origin falls back to `allowedOrigins[0]`, which may not match the actual request origin.

**Impact:** Potential CORS failures for the agent stream in deployed environments.

---

### C6. Health Check Lies — Always Reports Python as `true`

**File:** [app.js](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/src/app.js#L44-L53)

```js
app.get('/health', (req, res) => {
  res.json({
    services: {
      node: true,
      python: true, // will be true once Part 3 is built  ← STILL HARDCODED
    },
  });
});
```

This should dynamically check `isPythonAvailable()`.

---

## 🟡 HIGH — Logic Bugs & Data Integrity Issues

### H1. Zustand `persist` Stores Conversations but Frontend Doesn't Sync with Backend History

**File:** [useChatStore.js](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/src/store/useChatStore.js#L102-L108)

The Zustand store uses `persist` middleware to save `conversations` to `localStorage`. But the backend also maintains its own conversation history in `sessionStore.js`. These **two histories are completely independent** and will diverge:
- Frontend persists across refresh; backend in-memory history is lost on server restart
- Backend trims to 20 messages; frontend has no limit
- Clearing chat on frontend calls the backend clear endpoint, but doesn't handle failure

**Impact:** After a server restart, the user sees old messages in the UI but the backend has no history context, causing the LLM to lose conversational continuity.

---

### H2. `useStream.js` Has Dual `isStreaming` State — Store vs. Local

**Files:** [useStream.js](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/src/hooks/useStream.js#L7), [useChatStore.js](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/src/store/useChatStore.js#L64)

`useStream` maintains its own `useState(false)` for `isStreaming` (line 7), AND the Zustand store has `isStreaming` + `setStreaming`. The `useChat` hook uses the **store's** `isStreaming` to guard `sendMessage`, while `useStream` manages its own. These can desynchronize — e.g., if `stopStream` is called, `useStream` sets its local `isStreaming = false`, but the store's `isStreaming` might still be `true` until `onDone` fires.

**Impact:** UI state inconsistency — the send button may stay disabled or a stream may appear stuck.

---

### H3. `useChat.js` Real API Path — `onChunk` Receives Full Accumulated Text, But Frontend Expects It

**File:** [useChat.js](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/src/hooks/useChat.js#L70-L72)

This is OK for the SSE chunk handler in `useStream.js` because `sendChunk` in sse.js sends the FULL accumulated text each time (groq.js line 84: `onChunk(fullText)`). The frontend's `updateLastMessage` correctly replaces content with the accumulated text. This works.

BUT: The `onDone` callback (line 73) expects `metadata` with `fullText`, `citations`, `chartData`. The SSE `done` event from `sendDone` includes these. **However**, the `useStream.js` `startRealStream` function at line 47 parses `done` event data and passes it to `onDone`. The chat route sends:
```js
sendDone(res, { fullText, citations, chartData, mode, messageId });
```
So `data.fullText` is the cleaned text (after citation/chart extraction), but the `onChunk` calls were sending the raw text (including `[CITATION:...]` and `[CHART:...]` tags). This means the user **briefly sees raw citation tags** during streaming, then they disappear when `onDone` fires and replaces the content with `fullText`.

---

### H4. No File Deletion Cascade to Python RAG Indexes

**Files:** [upload.js](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/src/routes/upload.js#L123-L147), [vector_store.py](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/python_rag/app/rag/vector_store.py)

When a file is deleted via `DELETE /api/upload/:fileId`, the file is removed from disk and from the session store. But the **FAISS and BM25 indexes are never updated** — the chunks from the deleted file remain in the indexes forever.

**Impact:** Deleted documents still influence search results and agent analysis. This directly contributes to the "considering data from prev uploaded document" problem.

---

### H5. `@upstash/redis` is in Frontend `package.json` — Should Be Backend Only

**File:** [package.json](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/package.json#L18)

`"@upstash/redis": "^1.37.0"` is listed as a dependency in the **frontend** package.json. It's only used in the backend's `sessionStore.js`. This dependency should be in `backend/package.json` instead.

**Impact:** Unnecessary bundle size increase for the frontend. Also, this package is already handled server-side.

---

### H6. `react-router-dom` Installed but Never Used

**File:** [package.json](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/package.json#L28)

`"react-router-dom": "^7.13.2"` is a dependency but there are 0 routes defined. The app is a single-page shell (`App.tsx` → `AppShell`). No `<BrowserRouter>`, no `<Routes>`, nothing.

**Impact:** ~50KB of dead weight in the bundle.

---

### H7. `axios` Installed in Frontend but Never Imported

**File:** [package.json](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/package.json#L19)

All frontend HTTP calls use the browser's native `fetch` and `EventSource`. Axios is never imported anywhere in `src/`.

---

### H8. `TCS/` Data Directory in Project Root — Not Gitignored

**File:** `c:\Users\Riya\OneDrive\Desktop\nirma\finchatbot\TCS\`

There's a `TCS/` directory at the project root containing 9 PDF files (real TCS financial reports, ~4MB total). These should not be in the repository — they're user data, not source code.

---

## 🟠 MEDIUM — Architectural & Structural Issues

### M1. TypeScript Project With All Components Written in `.jsx` — No Type Safety

**Files:** [tsconfig.app.json](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/tsconfig.app.json), all `*.jsx` files

The project is configured as TypeScript (tsconfig, `@types/react`), but every single component, hook, store, and utility is pure JavaScript (`.jsx`, `.js`). The TypeScript compiler is essentially doing nothing — there's no type checking. Only `App.tsx` and `main.tsx` are actually TypeScript.

**Impact:** No compile-time safety. Prop mismatches, missing arguments, wrong types — all caught only at runtime.

---

### M2. `SmartChatMode` and `DocumentAnalysisMode` Are Identical Components

**Files:** [SmartChatMode.jsx](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/src/components/modes/SmartChatMode.jsx), [DocumentAnalysisMode.jsx](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/src/components/modes/DocumentAnalysisMode.jsx)

These are exact copy-paste clones — same 23 lines, character for character. The only difference is the export name. They both render `ChatWindow + ChatInput` and use `useChat()`.

**Impact:** Code duplication. Should be a single shared component, or the document analysis mode should have additional UI (e.g., document-specific controls, section navigator).

---

### M3. `dangerouslySetInnerHTML` Used for Markdown — XSS Vulnerability

**Files:** [MessageBubble.jsx](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/src/components/chat/MessageBubble.jsx#L66), [AgenticMode.jsx](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/src/components/modes/AgenticMode.jsx#L327-L336)

Both components render LLM output using `dangerouslySetInnerHTML` with a naive regex-based markdown parser. The LLM output is not sanitized — a malicious prompt injection could cause the LLM to output HTML/JavaScript that gets rendered directly.

**Impact:** XSS vulnerability if the LLM is tricked into outputting `<script>` tags or `onerror` attributes.

**Fix direction:** Use a proper markdown library (e.g., `react-markdown`) + `DOMPurify` sanitization.

---

### M4. `mockData.js` Imported in Production Code — Dead Code Paths

**Files:** [useChatStore.js](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/src/store/useChatStore.js#L4), [useChat.js](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/src/hooks/useChat.js#L4), [AgenticMode.jsx](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/src/components/modes/AgenticMode.jsx#L7), [InsightsMode.jsx](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/src/components/modes/InsightsMode.jsx#L10)

With `VITE_USE_MOCK=false`, the mock data paths are never executed but the 7.7KB `mockData.js` file is still imported and bundled. The `USE_MOCK` check happens at runtime, so tree-shaking can't eliminate it.

---

### M5. No Auth Protection on Agent Route

**File:** [agent.js](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/src/routes/agent.js#L11)

```js
router.post('/run', async (req, res) => {
  const userId = req.user?.id || 'demo';
```

Unlike the chat and upload routes which use `optionalAuth`, the agent route has **no auth middleware at all**. `req.user` will always be `undefined`, so `userId` is always `'demo'`.

**Impact:** All agent runs share the same `'demo'` user scope, even if different users are authenticated. File resolution via `getUploadedFiles('demo')` may return the wrong user's files.

---

### M6. Writer Node Sends Raw Deltas — Frontend Accumulates Correctly, But Groq Fallback Doesn't

This is a clarification of C2. The Python writer node (writer.py line 41) correctly sends each `chunk.content` as a delta. The Groq fallback (agent.js line 199) sends `accumulatedText`. The SSE event name is the same (`report_chunk`). The frontend has **one handler** for both paths. This means the handler can only be correct for one path.

---

### M7. `pyodide-py` in `requirements.txt` — Wrong Package

**File:** [requirements.txt](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/python_rag/requirements.txt#L22)

`pyodide-py` is listed but it's a browser-side Python runtime. The code executor uses `RestrictedPython`, not Pyodide. This package likely fails to install on a standard server environment.

---

### M8. Excel Header Row Mismatch Between Ingestion and Code Executor

**Files:** [ingestion.py](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/python_rag/app/rag/ingestion.py#L68-L89), [code_executor.py](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/python_rag/app/agent/tools/code_executor.py#L82-L106)

- `ingestion.py:parse_xlsx()` uses default `pd.ExcelFile.parse(sheet_name)` — headers from row 0
- `code_executor.py:load_dataframe()` uses `pd.read_excel(str(p), sheet_name=sheet, header=1)` — headers from row 1

The **same file** is read differently in RAG ingestion vs. agent code execution. The column names won't match, and the agent's generated pandas code will reference wrong column names.

**Impact:** Analyst code fails with `KeyError` because the columns it sees (from planner's data summary) don't match the DataFrame it gets (from `load_dataframe` with `header=1`).

---

### M9. `planner.py` Only Loads First File's Data — Multi-File Analysis Broken

**File:** [planner.py](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/python_rag/app/agent/nodes/planner.py#L30-L41)

```python
for fpath in state["file_paths"]:
    df = load_dataframe(fpath)
    if df is not None:
        ...
        break  # <-- Only processes the FIRST loadable file
```

Same issue in `analyst.py` (line 38-45) — only the first DataFrame is loaded. If the user uploads multiple files, only the first one is analyzed by the agent.

---

### M10. No Conversation History Sent to Agent

**Files:** [agent.js](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/src/routes/agent.js), [AgenticMode.jsx](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/src/components/modes/AgenticMode.jsx)

The agentic mode has its own separate UI (goal textarea + steps tracker) and **does not use the conversation history**. Each agent run is completely stateless — there's no way to say "now refine the last analysis" or "focus on section 3". The user types a goal, clicks run, gets a report. No conversational iteration.

---

## 🔵 LOW — Code Quality & Structure

### L1. Mixed Line Endings — `\r\n` in Python, `\n` in Node/React

All Python files use Windows line endings (`\r\n`). All JavaScript/TypeScript files use Unix (`\n`). The backend Node.js files like `agent.js` also have `\r\n`. This creates noisy git diffs and can cause issues with some tools.

---

### L2. No Error Boundary in React

**File:** [App.tsx](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/src/App.tsx)

There is no React Error Boundary anywhere. If any component throws during render (e.g., bad chart data, undefined property), the entire app white-screens.

---

### L3. `@app.on_event("startup")` is Deprecated in Modern FastAPI

**File:** [main.py](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/backend/python_rag/app/main.py#L19)

FastAPI now recommends using `@asynccontextmanager` lifecycle handlers instead of `on_event("startup")`.

---

### L4. `walkthrough_task1` and `walkthrough_task2` Files in Project Root

**File:** Project root

These appear to be development notes/task files. They should be in `.gitignore` or a docs folder, not the project root.

---

### L5. No `.gitignore` Entry for `TCS/`, `uploads/`, `indexes/`, `.venv/`, or `venv/`

**File:** [.gitignore](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/.gitignore)

User data directories should be gitignored.

---

### L6. Frontend Has No Loading/Auth Flow

The sidebar always shows "Demo User / Free Plan". There are auth routes (`/api/auth/register`, `/login`), but the frontend has **no login page, no registration form, no auth state management**. The `authToken` in Zustand is always `null`.

---

### L7. `Sidebar.jsx` Calls `removeFile` Directly Without Backend Sync

**File:** [Sidebar.jsx](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/src/components/layout/Sidebar.jsx#L166)

Line 166: `onClick={() => removeFile(file.id)}` — This calls the store's `removeFile` which only removes from Zustand state. The `useFileUpload` hook's `handleRemoveFile` does call the backend DELETE endpoint, but the Sidebar doesn't use that hook's function — it uses the raw store action.

**Impact:** Files are removed from the UI but persist on the server and in the RAG indexes.

---

### L8. `html2canvas` Dependency Installed but Never Used

**File:** [package.json](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/package.json#L21)

`"html2canvas": "^1.4.1"` — not imported anywhere in the codebase.

---

### L9. Several Radix UI Packages Installed but Never Used

**File:** [package.json](file:///c:/Users/Riya/OneDrive/Desktop/nirma/finchatbot/package.json#L13-L16)

`@radix-ui/react-dialog`, `@radix-ui/react-scroll-area`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip` are all installed. Only `react-dialog` appears to be potentially used by `FileUploadModal`. The rest are unused.

---

### L10. `constants/modes.js` Missing from `constants/` Directory Listing

The `constants` directory only has `modes.js` but isn't structured for growth. As Part 5 adds more config (Supabase keys, share URL patterns), this needs a proper config layer.

---

## Summary Table

| # | Severity | Issue | Root Cause |
|---|----------|-------|------------|
| C1 | 🔴 Critical | Agentic hallucination from old docs | No per-file index isolation |
| C2 | 🔴 Critical | Garbled output in Groq fallback | Accumulated vs. delta text mismatch |
| C3 | 🔴 Critical | Potential crash on clearChat | Inconsistent `req.user` safety |
| C4 | 🔴 Critical | No rate limit on agent route | `agentLimiter` unused |
| C5 | 🔴 Critical | CORS failure on agent SSE | Missing `req` in `initSSE` |
| C6 | 🔴 Critical | Health endpoint lies | Hardcoded `python: true` |
| H1 | 🟡 High | Frontend/backend history diverge | Two independent history stores |
| H2 | 🟡 High | Dual `isStreaming` state | Store vs. hook local state |
| H3 | 🟡 High | Raw tags flash during stream | Cleaning only on `onDone` |
| H4 | 🟡 High | Deleted files stay in RAG index | No index cleanup on delete |
| H5 | 🟡 High | Redis client in frontend bundle | Wrong `package.json` |
| H6 | 🟡 High | Unused `react-router-dom` | Dead dependency |
| H7 | 🟡 High | Unused `axios` in frontend | Dead dependency |
| H8 | 🟡 High | `TCS/` data in repo | Not gitignored |
| M1 | 🟠 Medium | No TypeScript enforcement | All `.jsx/.js` files |
| M2 | 🟠 Medium | Duplicate mode components | Copy-paste clone |
| M3 | 🟠 Medium | XSS via `dangerouslySetInnerHTML` | No sanitization |
| M4 | 🟠 Medium | Mock data always bundled | Runtime check, not compile |
| M5 | 🟠 Medium | No auth on agent route | Missing middleware |
| M6 | 🟠 Medium | Fallback vs. Python delta mismatch | Same event, different semantics |
| M7 | 🟠 Medium | `pyodide-py` wrong package | Invalid requirement |
| M8 | 🟠 Medium | Excel header row mismatch | `header=1` vs default |
| M9 | 🟠 Medium | Only first file analyzed | `break` after first load |
| M10 | 🟠 Medium | Agent has no conversation | Stateless per-run |
| L1 | 🔵 Low | Mixed line endings | CRLF vs LF |
| L2 | 🔵 Low | No React Error Boundary | Missing crash handler |
| L3 | 🔵 Low | Deprecated FastAPI startup | `on_event` |
| L4 | 🔵 Low | Walkthrough files in root | Not organized |
| L5 | 🔵 Low | Missing gitignore entries | Data directories tracked |
| L6 | 🔵 Low | No frontend auth UI | No login/register flow |
| L7 | 🔵 Low | Sidebar delete skips backend | Wrong function called |
| L8 | 🔵 Low | Unused `html2canvas` | Dead dependency |
| L9 | 🔵 Low | Unused Radix packages | Dead dependencies |
| L10 | 🔵 Low | Thin constants layer | Single file |

---

## Recommended Fix Priority (Before Part 5)

> [!IMPORTANT]
> **Fix these before adding Supabase, Shareable Links, or CI/CD:**

1. **C1 + H4** — Fix RAG index isolation (root cause of hallucination)
2. **C2 + M6** — Fix the report_chunk delta/accumulated mismatch
3. **C4 + M5** — Add `optionalAuth` and `agentLimiter` to agent route
4. **C5** — Pass `req` to `initSSE` in agent route
5. **L7** — Wire Sidebar's delete button to the proper `handleRemoveFile`
6. **M8** — Unify Excel header row handling
7. **M3** — Add DOMPurify or switch to `react-markdown`
8. **H5–H8, L8–L9** — Clean up `package.json` unused dependencies
