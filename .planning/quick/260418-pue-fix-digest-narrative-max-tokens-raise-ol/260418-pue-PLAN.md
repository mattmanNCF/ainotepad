---
phase: quick
plan: 260418-pue
type: execute
wave: 1
depends_on: []
files_modified:
  - src/main/aiWorker.ts
  - src/main/aiOrchestrator.ts
autonomous: true
requirements: [PUE-fix-digest-narrative]

must_haves:
  truths:
    - "Weekly digest narrative is non-empty after Generate Now click with Ollama provider"
    - "Digest rows do not accumulate indefinitely for the same period"
  artifacts:
    - path: "src/main/aiWorker.ts"
      provides: "callAIWithPrompt with 4096 max_tokens for Ollama and OpenAI branches"
      contains: "max_tokens: 4096"
    - path: "src/main/aiOrchestrator.ts"
      provides: "Digest cleanup after INSERT"
      contains: "DELETE FROM digests WHERE period"
  key_links:
    - from: "src/main/aiWorker.ts callAIWithPrompt (ollama branch)"
      to: "Ollama /v1/chat/completions"
      via: "OpenAI client with baseURL localhost:11434/v1"
      pattern: "max_tokens: 4096"
---

<objective>
Fix weekly digest narrative generation for Ollama (Gemma 4 E4B). The model consumes thinking tokens before emitting output; with max_tokens=512 the thinking budget exhausts before the {"narrative":"..."} JSON is written, causing Ollama to return null content. Raise Ollama and OpenAI branches to 4096 tokens. Add a post-INSERT cleanup in aiOrchestrator to prevent digest row accumulation per period.

Purpose: Unblock digest feature for Ollama users; prevent indefinite DB growth from repeated Generate Now clicks.
Output: src/main/aiWorker.ts (max_tokens raised), src/main/aiOrchestrator.ts (cleanup DELETE added).
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Raise max_tokens for Ollama and OpenAI branches in callAIWithPrompt</name>
  <files>src/main/aiWorker.ts</files>
  <action>
    In function `callAIWithPrompt` (around line 137):

    1. Ollama branch (line 141): change `max_tokens: 512` to `max_tokens: 4096`
    2. OpenAI branch (line 152): change `max_tokens: 512` to `max_tokens: 4096`
    3. Claude branch (line 163): leave at `max_tokens: 512` — Claude has no thinking overhead in this context and 512 is sufficient for a 2-4 sentence narrative JSON

    These are the ONLY three changes in this file. Do not touch any other values or logic.
  </action>
  <verify>
    <automated>grep -n "max_tokens" src/main/aiWorker.ts</automated>
  </verify>
  <done>Ollama branch shows max_tokens: 4096, OpenAI branch shows max_tokens: 4096, Claude branch still shows max_tokens: 512</done>
</task>

<task type="auto">
  <name>Task 2: Add digest row cleanup after INSERT in aiOrchestrator</name>
  <files>src/main/aiOrchestrator.ts</files>
  <action>
    In the `digest-result` handler, immediately after the INSERT `.run(...)` call (line 54), add a cleanup DELETE before the `if (mainWin ...)` block:

    ```typescript
    // Clean up stale rows for same period (keep only most recent; prevent growth from repeated Generate Now)
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    getSqlite().prepare(
      `DELETE FROM digests WHERE period=? AND generated_at < ?`
    ).run(period, cutoff)
    ```

    Insert this block between line 54 (the `.run(...)` call) and line 55 (the `if (mainWin ...` block). No other changes.
  </action>
  <verify>
    <automated>grep -n "DELETE FROM digests" src/main/aiOrchestrator.ts</automated>
  </verify>
  <done>DELETE statement present in aiOrchestrator.ts within the digest-result handler block, referencing period and cutoff variables</done>
</task>

</tasks>

<verification>
After both tasks, run a build to confirm no TypeScript errors:

```bash
npm run build 2>&1 | tail -20
```

Build must complete with zero errors. The fix cannot be fully verified without Ollama running + a 7-day note corpus, so build-clean is the automated gate.
</verification>

<success_criteria>
- `grep -n "max_tokens" src/main/aiWorker.ts` shows 4096 on lines ~141 and ~152, 512 on line ~163
- `grep -n "DELETE FROM digests" src/main/aiOrchestrator.ts` returns a match
- `npm run build` exits 0
</success_criteria>

<output>
After completion, create `.planning/quick/260418-pue-fix-digest-narrative-max-tokens-raise-ol/260418-pue-SUMMARY.md`
</output>
