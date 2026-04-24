# README npm publish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update README for the npm-published package and publish `@wolffycode/selo`.

**Architecture:** This is a documentation and release task. Keep source code unchanged, preserve the existing `package.json` version bump to `1.0.0`, validate with tests and npm pack dry run, then publish the scoped package publicly.

**Tech Stack:** Node.js, npm, Markdown.

---

### Task 1: README install docs

**Files:**
- Modify: `README.md`

**Step 1: Update npm install wording**

Replace the pre-publish warning with formal npm install instructions.

**Step 2: Keep local development instructions**

Keep `npm link` guidance, but make it secondary to npm installation.

**Step 3: Verify README renders logically**

Run: `sed -n '1,220p' README.md`
Expected: README no longer says the package is unpublished.

### Task 2: Release validation

**Files:**
- Read: `package.json`
- Read: `README.md`

**Step 1: Run tests**

Run: `npm test`
Expected: PASS.

**Step 2: Verify npm package contents**

Run: `npm pack --dry-run`
Expected: Tarball includes `bin`, `src`, `README.md`, `LICENSE`, and `package.json`.

### Task 3: Publish to npm

**Files:**
- Read: `package.json`

**Step 1: Publish public scoped package**

Run: `npm publish --access public`
Expected: npm publishes `@wolffycode/selo@1.0.0`.
