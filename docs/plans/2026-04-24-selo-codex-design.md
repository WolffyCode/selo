# selo codex Design

## Goal

Add `selo codex` for terminal Codex only.

## Design

`selo codex` reads `app_type='codex'` providers from CC Switch, shows the same terminal picker, then launches `codex` with an isolated temporary `CODEX_HOME`.

The temporary home is created under the OS temp directory as `selo-codex-*`. It contains `config.toml` and, when present, `auth.json`. The selected provider can also merge `common_config_codex`.

`~/.codex` is never written by this command. The `CODEX_HOME` value is passed only in the child process environment for the launched terminal Codex process.

When Codex exits, `selo` deletes the temporary home. On each `selo codex` start, old `selo-codex-*` temp directories older than 24 hours are removed.

## Tests

Cover app-specific provider queries, Codex TOML/auth file generation, child environment, cleanup, and CLI app-mode parsing.
