# Model Picker UI Design

## Goal

Release `@wolffycode/selo` `1.1.0` with a clearer terminal picker for Claude and Codex providers.

## Current Behavior

The picker renders each provider as two plain lines: provider name and secondary text. Claude uses `providers.notes` before falling back to the base URL. Codex previously showed parsed TOML fields instead of `providers.notes`; that regression is already covered by a test and fix in the working tree.

## Chosen Approach

Keep the existing dependency-free terminal picker and improve the text layout:

- Use one shared row formatter for Claude and Codex so both modes stay visually consistent.
- Show the selected marker, provider name, and mode label on the first line.
- Show CC Switch description on the second line when present.
- Fall back to useful config details only when no description exists.
- Keep keyboard behavior unchanged: up/down navigate, enter selects, escape cancels.

## Alternatives Considered

1. Keep the current UI and only publish the description fix.
   This is lowest risk, but it does not address the requested picker polish.

2. Add a full-screen TUI dependency.
   This would allow richer widgets, but it adds package weight and risk for a small CLI.

3. Build a small shared renderer with ANSI text.
   This keeps the package simple and improves consistency. This is the selected option.

## Testing

Use `node:test` to cover:

- Codex secondary text prefers CC Switch notes over config details.
- The shared picker renderer includes the expected title, mode label, selected marker, description, and fallback config detail.
- Existing launch and store tests still pass.

## Release

After implementation, bump `package.json` to `1.1.0`, run the full test suite, and publish with `npm publish`.
