# selo

在终端中读取 `CC Switch` 的 Claude / Codex provider，并用选中的配置启动对应 CLI。

`selo` 是个人开发者工具，不是 `CC Switch` 官方工具。

它解决两个问题：

- 避开 Unix/Linux/macOS 上 `cc` 命令和系统编译器的命名冲突
- 在终端里快速切换不同 Claude 或 Codex provider，并尽量与 `CC Switch` 当前状态保持一致

## Prerequisites

- 已安装并配置 `CC Switch`
- 使用 `selo claude` 时，已安装 `claude` CLI
- 使用 `selo codex` 时，已安装 `codex` CLI
- 已安装系统 `sqlite3`

`selo` 把 `CC Switch` 当成硬性前提。它不会自己管理 provider，也不会替你安装 `claude`。

## Install

推荐通过 npm 全局安装：

```bash
npm i -g @wolffycode/selo
```

### Local development

在本机调试时，使用：

```bash
cd /Users/wangbingkun/Desktop/person/WolffyCode/selo
env npm_config_prefix=$HOME/.local npm link
```

## Usage

```bash
selo claude
selo codex
selo reclaude
selo -v
selo claude -d
selo codex -d
selo reclaude -d
```

`selo claude -d` 会把 `--dangerously-skip-permissions` 传给 `claude`。

`selo codex -d` 会把 `--dangerously-bypass-approvals-and-sandbox` 传给 `codex`。

`selo codex` 只管理终端版 Codex。桌面端 Codex 继续使用自己的配置。

`selo reclaude` 不走 CC Switch，直接透传给本机 `reclaude` CLI。除 `-d` 翻译成 `--dangerously-skip-permissions` 外，其它参数（含 `-v`/`--version`）一律原样转发。

## How It Works

`selo claude` 的行为：

- 从 `~/.cc-switch/cc-switch.db` 读取 Claude providers
- 从 `~/.cc-switch/settings.json` 读取当前选中的 Claude provider
- 如果 provider 开启了 `commonConfigEnabled`，会合并 `common_config_claude`
- 打开 picker 时监听 `CC Switch` 配置变化，列表会自动刷新
- 按下回车启动前，会再次按 provider id 读取最新配置
- 真正启动 `claude` 时，会写入一份临时 settings 文件，运行中的 Claude 会话不会被后续的 `CC Switch` 改动污染

`selo codex` 的行为：

- 从 `~/.cc-switch/cc-switch.db` 读取 Codex providers
- 从 `~/.cc-switch/settings.json` 读取当前选中的 Codex provider
- 如果 provider 开启了 `commonConfigEnabled`，会合并 `common_config_codex`
- 保留原生 `CODEX_HOME`，继续使用现有会话、信任状态、MCP、插件、技能和规则
- 每次启动写入独立的临时 Codex profile，只覆盖本次选择的 provider 配置
- provider API key 只传给这次启动的 `codex` 子进程
- `codex` 退出后删除临时 profile
- 每次启动前清理超过 24 小时的 `selo-provider-*` 临时 profile
- `doctor`、`plugin` 等不支持 profile 的管理命令保持原参数透传

## Consistency Rules

默认高亮优先级：

1. `CC Switch.settings.json.currentProviderClaude`
2. `providers.is_current = 1`
3. `selo` 本地记录的上次选择
4. 第一条 provider

这和你当前本地 `cc` 最大的区别是：`selo` 不会让自己的本地状态覆盖 `CC Switch` 当前 provider。

`selo codex` 使用同样规则，但字段换成 `currentProviderCodex` 和 `lastProviderCodex`。

## Development

```bash
npm test
node bin/selo.js -v
```
