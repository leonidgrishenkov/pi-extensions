# pi-extensions

Personal [pi coding agent](https://pi.dev) extensions, themes, and prompt templates.

## Install

```sh
pi install git:github.com/leonidgrisenkov/pi-extensions
```

Pi will clone the repo, load all extensions, themes, and prompts automatically on next startup.

## Update

```sh
pi update git:github.com/leonidgrisenkov/pi-extensions
```

## Contents

### Extensions

| Extension | Description |
|---|---|
| `notify.ts` | Native terminal notification (OSC 777/99, Windows toast) when agent finishes |
| `permission-gate.ts` | Confirmation prompt before dangerous bash commands (`rm -rf`, `sudo`, etc.) |
| `preset.ts` | Named presets for model/thinking/tools/instructions — `/preset`, `Ctrl+Shift+U` to cycle |
| `protected-paths.ts` | Blocks read/write access to sensitive paths (`.env`, `.git`, `.terraform`, etc.) |
| `questionnaire.ts` | Custom tool for single/multi-question UIs with tab navigation |
| `ssh.ts` | Transparent remote execution — redirects all tool calls over SSH (`--ssh user@host`) |
| `starship-footer.ts` | Replaces pi footer with starship prompt + session cost/token info |
| `tools.ts` | `/tools` command for interactive enable/disable of tools |
| `mcp/` | MCP (Model Context Protocol) proxy tool — connects pi to external MCP servers |
| `web-fetch/` | `web_fetch` tool — fetches URLs, converts HTML→Markdown, GitHub-aware extraction |
| `web-search/` | `web_search` tool — Tavily/Brave/Perplexity/Exa fallback chain |

### Themes

Catppuccin variants: `catppuccin-frappe`, `catppuccin-latte`, `catppuccin-macchiato`, `catppuccin-mocha`.

Source: https://github.com/otahontas/pi-coding-agent-catppuccin

### Prompt templates

| Template | Description |
|---|---|
| `git-commit.md` | Review staged changes and commit with Conventional Commits format |
| `git-review.md` | Code review of staged git changes |

## Structure

```
pi-extensions/
├── package.json
├── extensions/
│   ├── notify.ts
│   ├── permission-gate.ts
│   ├── preset.ts
│   ├── protected-paths.ts
│   ├── questionnaire.ts
│   ├── ssh.ts
│   ├── starship-footer.ts
│   ├── tools.ts
│   ├── mcp/          # MCP proxy (needs npm install)
│   ├── web-fetch/    # Web fetch tool (needs npm install)
│   └── web-search/   # Web search tool (no deps)
├── themes/
│   ├── catppuccin-frappe.json
│   ├── catppuccin-latte.json
│   ├── catppuccin-macchiato.json
│   └── catppuccin-mocha.json
└── prompts/
    ├── git-commit.md
    └── git-review.md
```
