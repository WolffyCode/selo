# selo

在终端中读取 `CC Switch` 的 Claude provider，并用选中的配置启动 `claude`。

`selo` 是个人开发者工具，不是 `CC Switch` 官方工具。

它解决两个问题：

- 避开 Unix/Linux/macOS 上 `cc` 命令和系统编译器的命名冲突
- 在终端里快速切换不同 Claude provider，并尽量与 `CC Switch` 当前状态保持一致

## Prerequisites

- 已安装并配置 `CC Switch`
- 已安装 `claude` CLI
- 已安装系统 `sqlite3`

`selo` 把 `CC Switch` 当成硬性前提。它不会自己管理 provider，也不会替你安装 `claude`。

## Install

```bash
npm i -g @wolffycode/selo
```

## Usage

```bash
selo
selo -v
selo -d
```

`-d` 会把 `--dangerously-skip-permissions` 传给 `claude`。

## How It Works

- 从 `~/.cc-switch/cc-switch.db` 读取 Claude providers
- 从 `~/.cc-switch/settings.json` 读取当前选中的 Claude provider
- 如果 provider 开启了 `commonConfigEnabled`，会合并 `common_config_claude`
- 打开 picker 时监听 `CC Switch` 配置变化，列表会自动刷新
- 按下回车启动前，会再次按 provider id 读取最新配置
- 真正启动 `claude` 时，会写入一份临时 settings 文件，运行中的 Claude 会话不会被后续的 `CC Switch` 改动污染

## Consistency Rules

默认高亮优先级：

1. `CC Switch.settings.json.currentProviderClaude`
2. `providers.is_current = 1`
3. `selo` 本地记录的上次选择
4. 第一条 provider

这和你当前本地 `cc` 最大的区别是：`selo` 不会让自己的本地状态覆盖 `CC Switch` 当前 provider。

## Development

```bash
npm test
node bin/selo.js -v
```
