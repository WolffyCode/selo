# selo codex Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `selo codex` so terminal Codex can run from selected CC Switch Codex configs without modifying `~/.codex`.

**Architecture:** Reuse the existing picker and watcher with an app mode. Add a Codex launch plan that writes CC Switch Codex config into a temporary `CODEX_HOME`, starts `codex`, and deletes the temp directory after exit.

**Tech Stack:** Node.js CommonJS, `node:test`, `sqlite3`, CC Switch SQLite data.

---

### Task 1: CLI Mode Parsing

**Files:**
- Modify: `src/cli.js`
- Test: `test/cli.test.js`

**Steps:**
1. Add failing tests for `selo codex --search`.
2. Verify tests fail.
3. Parse `codex` as `appType='codex'` and keep following args as `childArgs`.
4. Verify tests pass.

### Task 2: CC Switch Codex Reads

**Files:**
- Modify: `src/store/cc-switch.js`
- Test: `test/store.test.js`

**Steps:**
1. Add failing tests for querying `app_type='codex'` and reading `common_config_codex`.
2. Verify tests fail.
3. Parameterize provider queries and common config reads by app type.
4. Verify tests pass.

### Task 3: Codex Launch Plan

**Files:**
- Create: `src/core/codex-launch.js`
- Test: `test/codex-launch.test.js`

**Steps:**
1. Add failing tests for temp `CODEX_HOME`, `config.toml`, `auth.json`, child env, cleanup, and stale temp cleanup.
2. Verify tests fail.
3. Implement the minimal launch plan and cleanup helpers.
4. Verify tests pass.

### Task 4: Wire `selo codex`

**Files:**
- Modify: `src/cli.js`
- Test: `test/cli.test.js`

**Steps:**
1. Add failing test that Codex mode calls Codex provider load and spawns `codex`.
2. Verify tests fail.
3. Wire app-specific snapshot, picker title, launch plan, and availability check.
4. Verify tests pass.

### Task 5: Docs and Full Verification

**Files:**
- Modify: `README.md`

**Steps:**
1. Document `selo codex`.
2. Run `npm test`.
3. Run `node bin/selo.js -v`.
