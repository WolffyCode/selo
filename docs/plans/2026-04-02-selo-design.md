# Selo Design

**Date:** 2026-04-02

## Goal

Build a public Node.js CLI named `selo` that lets users pick a Claude provider from CC Switch and launch `claude` with the selected provider settings, while avoiding the `cc` command name conflict on Unix-like systems.

## Product Positioning

- `selo` is an independent personal developer tool, not an official CC Switch tool.
- `selo` depends on a locally installed and configured CC Switch instance.
- `selo` also depends on a locally installed `claude` CLI.
- `selo` only handles Claude provider selection and Claude launch.
- `selo` does not create, edit, or manage CC Switch providers.

## Packaging

- Repository: `WolffyCode/selo`
- Primary command: `selo`
- Preferred npm publish target: `selo`
- Fallback npm publish target if the unscoped name is unavailable: `@wolffycode/selo`
- The exposed terminal command remains `selo` in both cases.

## Compatibility Requirements

`selo` must match the current local `cc` tool behavior for:

- Interactive provider picker
- `-v` version output
- `-d` mapping to `--dangerously-skip-permissions`
- Provider-specific Claude settings assembly
- Temporary settings file launch flow
- Cleanup after the Claude child process exits

## Source Of Truth

`selo` treats CC Switch as the single source of truth.

It must read:

- `~/.cc-switch/cc-switch.db`
- `~/.cc-switch/settings.json`

It must not persist provider state inside the package installation directory because global npm installs may be read-only.

## Effective Provider Resolution

The effective Claude launch configuration is derived from:

1. The selected provider row in the `providers` table
2. The provider `meta` JSON
3. The `settings` table entry `common_config_claude`
4. The current CC Switch state in `~/.cc-switch/settings.json`

If `meta.commonConfigEnabled === true`, `selo` merges `common_config_claude` with the provider-specific `settings_config` using the current merge semantics from the local `cc` tool.

## Default Selection Priority

To avoid mismatch with CC Switch, the default highlighted provider must be resolved with this priority:

1. `~/.cc-switch/settings.json.currentProviderClaude`
2. `providers.is_current = 1`
3. `selo` local state for the last selected provider
4. The first Claude provider row

Unlike the current local `cc` tool, `selo` must not let its own local state override CC Switch current provider state.

## Runtime Consistency Model

The tool needs distinct behavior for three moments:

### 1. Picker open

When `selo` starts, it loads a snapshot of:

- Claude providers
- Common Claude config
- Current CC Switch settings

It also records file fingerprints for the DB and JSON settings file.

### 2. Picker still open while CC Switch changes

While the picker is open, `selo` watches:

- `~/.cc-switch/cc-switch.db`
- `~/.cc-switch/settings.json`

When either file changes, `selo` reloads the provider snapshot and redraws the picker.

Rules:

- If the currently highlighted provider still exists, keep it selected.
- If it was deleted, fall back using the default selection priority.
- If providers are added or edited, the visible list updates without requiring a new terminal.

The watch layer should use `fs.watch` plus a lightweight polling fallback to avoid missed events.

### 3. User confirms a provider and Claude launches

On `Enter`, `selo` re-reads the selected provider by id before launch instead of trusting stale in-memory picker data.

Then it:

- Resolves the effective settings
- Writes a temporary Claude settings file
- Clears inherited `ANTHROPIC_*` variables from the child environment
- Starts `claude` with `--setting-sources project,local --settings <tempfile>`

After launch, the Claude session is intentionally frozen to the chosen snapshot. Later CC Switch edits must not mutate the already-running Claude process.

## Local State

`selo` may store a small user-level state file for non-authoritative preferences such as the last selected provider.

Proposed path:

- `~/.config/selo/settings.json` on Unix-like systems
- Equivalent OS-specific config directory via Node platform APIs where needed

This state is advisory only and never overrides the current CC Switch provider.

## Data Access Strategy

First implementation strategy:

- Keep the current SQLite-backed behavior
- Use the system `sqlite3` binary to query CC Switch data
- Wrap this behind a dedicated store module so the storage backend can be swapped later without rewriting business logic

Reasoning:

- It matches the proven local behavior
- It keeps the first public release small and predictable
- It avoids introducing a new database parser before the product behavior is stable

## Error Handling

Clear user-facing failures are required for:

- CC Switch not installed
- `sqlite3` missing
- `claude` missing
- No Claude providers configured
- Malformed provider JSON in the DB
- Provider deleted between picker render and confirmation

## Planned Package Structure

- `bin/selo.js` for the executable entrypoint
- `src/cli.js` for terminal interaction
- `src/store/cc-switch.js` for SQLite and settings reads
- `src/store/selo-config.js` for local user state
- `src/core/launch.js` for launch-plan generation
- `src/core/provider.js` for merge and selection logic
- `test/*.test.js` for Node built-in tests

## Testing Strategy

Use Node's built-in test runner.

Cover:

- CLI arg parsing
- Default provider priority
- Effective config merging
- Launch plan temp settings behavior
- Watch-triggered reload behavior
- Deleted-provider recovery during an open picker
- Clear errors for missing dependencies

## Non-Goals For V1

- Managing CC Switch providers
- Supporting non-Claude CLIs
- Editing CC Switch state
- Cross-process locking or database writes
- Publishing any GUI
