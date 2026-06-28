# pi-extensions

Personal [pi coding agent](https://pi.dev) extensions, themes, and prompt templates.

## Install

```sh
pi install git:github.com/leonidgrishenkov/pi-extensions
```

Pi will clone the repo, load all extensions, themes, and prompts automatically on next startup.

## Update

```sh
pi update git:github.com/leonidgrishenkov/pi-extensions
```

## Themes

Catppuccin variants: `catppuccin-frappe`, `catppuccin-latte`, `catppuccin-macchiato`, `catppuccin-mocha`.

Source: https://github.com/otahontas/pi-coding-agent-catppuccin

## Extensions

| Extension            | Description                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `notify.ts`          | Native terminal notification (OSC 777/99, Windows toast) when agent finishes             |
| `permission-gate.ts` | Confirmation prompt before dangerous bash commands (`rm -rf`, `sudo`, etc.)              |
| `preset.ts`          | Named presets for model/thinking/tools/instructions — `/preset`, `Ctrl+Shift+U` to cycle |
| `protected-paths.ts` | Blocks read/write access to sensitive paths (`.env`, `.git`, `.terraform`, etc.)         |
| `questionnaire.ts`   | Custom tool for single/multi-question UIs with tab navigation                            |
| `ssh.ts`             | Transparent remote execution — redirects all tool calls over SSH (`--ssh user@host`)     |
| `starship-footer.ts` | Replaces pi footer with starship prompt + session cost/token info                        |
| `tools.ts`           | `/tools` command for interactive enable/disable of tools                                 |
| `mcp/`               | MCP (Model Context Protocol) proxy tool — connects pi to external MCP servers            |
| `web-fetch/`         | `web_fetch` tool — fetches URLs, converts HTML→Markdown, GitHub-aware extraction         |
| `web-search/`        | `web_search` tool — Tavily/Brave/Perplexity/Exa fallback chain                           |

### mcp

Minimal MCP (Model Context Protocol) client extension. Connects pi to external MCP servers and exposes their tools
through a single token-efficient proxy tool.

#### Config

MCP servers are declared in standard MCP config files, merged in this order (later wins per server name):

1. `~/.pi/agent/mcp.json` — global
2. `<cwd>/.mcp.json` — project, shared standard
3. `<cwd>/.pi/mcp.json` — project, pi override

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/abs/path"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }
    },
    "my-api": {
      "url": "https://mcp.example.com/mcp",
      "auth": "bearer",
      "bearerTokenEnv": "MY_MCP_TOKEN"
    }
  }
}
```

| Field            | Transport | Description                                        |
| ---------------- | --------- | -------------------------------------------------- |
| `command`        | stdio     | Executable to run                                  |
| `args`           | stdio     | Arguments for the command                          |
| `env`            | stdio     | Env vars (interpolated, merged over `process.env`) |
| `cwd`            | stdio     | Working directory (interpolated)                   |
| `url`            | http      | Endpoint (StreamableHTTP, falls back to SSE)       |
| `headers`        | http      | Headers (interpolated)                             |
| `auth`           | http      | Set to `"bearer"` to send `Authorization: Bearer`  |
| `bearerToken`    | http      | Literal token (interpolated)                       |
| `bearerTokenEnv` | http      | Env var name holding the token                     |

`${VAR}` interpolation is supported in `env`, `cwd`, `url`, `headers`, and `bearerToken`.

#### Usage

##### From the agent (the `mcp` tool)

```text
mcp({})                                  // status: configured servers
mcp({ search: "screenshot" })            // find tools across all servers
mcp({ server: "github" })                // list a server's tools
mcp({ tool: "create_issue", args: { ... } })           // call a tool
mcp({ tool: "list_repos", server: "github" })          // disambiguate
```

`args` is a JSON object, not a string.

##### From the user (the `/mcp` command)

```
/mcp                    // show status (notify)
/mcp tools              // pick a server, list its tools
/mcp tools github       // list tools for a specific server
/mcp reconnect          // pick a server, reconnect
/mcp reconnect github   // reconnect a specific server
```

#### What's intentionally not here

- **No OAuth.** Use `bearerToken` / `bearerTokenEnv` for HTTP auth.
- **No config import** from Cursor / Claude Code / Codex / Claude Desktop.
- **No on-disk metadata cache.** Tool metadata is fetched per session.
- **No direct-tool registration.** A single `mcp` proxy tool keeps the context window small.
- **No custom UI panel.** `/mcp` uses native pi dialogs only.

#### Layout

```
mcp/
├── package.json   # @modelcontextprotocol/sdk dependency
├── index.ts       # entry: tool + command registration, lifecycle, dispatch
├── client.ts      # McpServerManager: transports, connect/list/call, content
└── config.ts      # config loading/merging + ${VAR} interpolation
```

### web-fetch

A `web_fetch` tool fetches content from a URL and converts it into a clean, LLM-friendly representation.

What makes it more than a plain HTTP client:

- **HTML → Markdown** conversion by default (with `text` and `html` alternatives).
- **GitHub-aware extraction** — `github.com` URLs return structured repository content (file trees, README, file text)
  instead of raw HTML, with a local shallow clone the agent can explore further via `read`/`bash`.
- **Security hardening** — HTTPS upgrade, DNS-aware SSRF protection with per-hop redirect validation, cross-host
  redirect detection, size guards, and timeouts.
- **Actionable errors** — failure messages include hints so the model can retry intelligently.

#### Architecture

```mermaid
flowchart TD
    Agent["pi agent calls web_fetch"]

    subgraph Dispatch["index.ts (tool entry point)"]
        Route{"Is it a\ngithub.com URL?"}
    end

    subgraph GitHub["GitHub path (github-extract.ts)"]
        Parse["Parse URL\nowner / repo / ref / path"]
        SizeCheck{"Repo size >\nthreshold?"}
        Clone["Shallow clone\nvia gh / git"]
        ApiFallback["gh api\n(tree + README / file)"]
        GenContent["Build structured content\nfile tree · README · file text"]
    end

    subgraph HTTP["HTTP path (fetcher.ts + ssrf-protection.ts)"]
        Preflight["Pre-flight SSRF check\n(URL + resolved IPs)"]
        FetchLoop{"Per-redirect-hop\nSSRF validate + fetch\n(manual redirects)"}
        Fetch["fetch() with browser\nUser-Agent"]
        Cloudflare{"Cloudflare\n403 challenge?"}
        Retry["Retry entire chain\nwith honest UA"]
    end

    subgraph Format["format.ts"]
        Convert["HTML → Markdown\n(or text / html passthrough)"]
        Truncate["Truncate to 240K chars"]
    end

    Agent --> Route
    Route -- "Yes" --> Parse
    Parse --> SizeCheck
    SizeCheck -- "Small / forceClone" --> Clone
    SizeCheck -- "Large / SHA URL" --> ApiFallback
    Clone --> GenContent
    ApiFallback --> GenContent
    Clone -- "clone failed" --> ApiFallback
    Route -- "No / GitHub failed" --> Preflight
    Preflight --> FetchLoop
    FetchLoop --> Fetch
    Fetch --> Cloudflare
    Cloudflare -- "Yes" --> Retry
    Cloudflare -- "No" --> Convert
    Retry --> Convert
    GenContent --> Convert
    Convert --> Truncate
    Truncate --> Agent
```

#### Components

| File                  | Role                                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`            | Tool definition, registration, and request dispatch. Routes GitHub URLs to the GitHub extractor and everything else to the HTTP fetcher; renders results in the TUI.                                                                       |
| `types.ts`            | Shared types (`FetchResult`, `FetchParams`, `FetchError`, `GitHubUrlInfo`, `GitHubCloneConfig`) and constants (timeouts, size limits, GitHub defaults).                                                                                    |
| `fetcher.ts`          | Pure HTTP transport: orchestrates URL normalization, SSRF pre-flight checks, Cloudflare UA fallback, timeouts, and size guards on top of the SSRF module. Returns a normalized `FetchResult`.                                              |
| `ssrf-protection.ts`  | DNS-aware SSRF guard. `validateRemoteUrl()` resolves the hostname and rejects any private/reserved IP it maps to; `fetchRemoteUrl()` wraps `fetch()` with `redirect: "manual"` and re-validates every redirect hop before contacting it.   |
|                       | Blocks loopback, RFC 1918, CGNAT (100.64/10), link-local (169.254), benchmark (198.18/15), multicast, IPv6 ULA, link-local, and IPv4-mapped addresses. Provides an opt-in `allowRanges` CIDR whitelist for TUN/fake-IP proxies.            |
| `github-extract.ts`   | GitHub URL parser and the clone-or-API decision engine. Shallow-clones small repos (with session-local caching), falls back to the `gh` API for large repos or commit-SHA URLs, and assembles structured Markdown content from the result. |
| `github-api.ts`       | Thin, non-throwing wrappers around the `gh` CLI: auth detection, repo size, default branch, file tree, README, and single-file fetch.                                                                                                      |
| `format.ts`           | `formatResultForLLM()` — converts the raw response to the requested format, prepends a redirect banner, and truncates large outputs to protect the context window.                                                                         |
| `html-to-markdown.ts` | Turndown-backed HTML → Markdown converter that strips scripts/styles/navigation while preserving semantic structure (headings, lists, code blocks).                                                                                        |

#### GitHub extraction in detail

When the agent fetches a `github.com` URL, the tool recognizes the URL shape and extracts structured content instead of
fetching rendered HTML:

- **Repo root** (`/owner/repo`) → file tree + README.
- **Directory** (`/owner/repo/tree/<ref>/<path>`) → directory listing with file sizes.
- **File** (`/owner/repo/blob/<ref>/<path>`) → file contents (with binary detection and truncation).

The decision between cloning and using the API:

1. **Cached clone?** → reuse the session-local clone.
2. **Full commit-SHA URL?** → use the `gh` API (can't shallow-clone a SHA).
3. **Repo larger than `maxRepoSizeMB`?** → use the `gh` API (tree + README). The `forceClone` parameter overrides this.
4. **Otherwise** → shallow clone (`gh repo clone` when authenticated, `git clone` for public repos as fallback). If
   cloning fails, fall back to the API.

Non-code GitHub paths (`/issues`, `/pull`, `/discussions`, etc.) are intentionally **not** intercepted — they fall
through to the normal HTTP fetcher, since they serve HTML pages rather than repository content.

> **Note:** The `gh` CLI is required for API calls, private repos, and the size-check preflight. Without `gh`
> authentication, public repos still work via `git clone`.

#### SSRF protection in detail

The tool is exposed to arbitrary URLs chosen by the LLM (or supplied by the user), so the fetcher needs to defend
against server-side request forgery — attacks that coerce the server into contacting internal/private network resources.
Protection happens at two layers:

1. **Pre-flight validation** (`validateRemoteUrl`) runs immediately after URL normalization, before the timeout timer
   starts. It rejects:
   - Non-`http`/`https` protocols (`file:`, `ftp:`, `gopher:` …).
   - The literal hostnames `localhost` and `*.localhost`.
   - Any literal-IP hostname in a blocked RFC range.
   - Hostnames that resolve (via DNS) to a blocked IP. This closes the DNS-rebinding vector: a public-looking domain
     whose A record points at `169.254.169.254` (cloud metadata) is caught here.

2. **Per-hop redirect validation** runs inside the transport (`fetchRemoteUrl`). The fetcher uses `redirect: "manual"`
   and, for every `301`/`302`/`303`/`307`/`308` it observes, it resolves the `Location` target through the same guard
   _before_ following it. This prevents a public URL from 302-ing into an internal address — a bypass that defeats any
   single-shot validation.

##### Blocked address ranges

| IPv4             | What it covers                                       |
| ---------------- | ---------------------------------------------------- |
| `0.0.0.0/8`      | "This host" / current network                        |
| `10.0.0.0/8`     | RFC 1918 private                                     |
| `127.0.0.0/8`    | Loopback                                             |
| `100.64.0.0/10`  | Carrier-grade NAT                                    |
| `169.254.0.0/16` | Link-local (includes `169.254.169.254` metadata svc) |
| `172.16.0.0/12`  | RFC 1918 private                                     |
| `192.168.0.0/16` | RFC 1918 private                                     |
| `198.18.0.0/15`  | Benchmarking                                         |
| `224.0.0.0/4`+   | Multicast/reserved                                   |

| IPv6             | What it covers                                   |
| ---------------- | ------------------------------------------------ |
| `::/128`         | Unspecified                                      |
| `::1/128`        | Loopback                                         |
| `fc00::/7`       | ULA (Unique Local Addresses)                     |
| `fe80::/10`      | Link-local                                       |
| `::ffff:x.x.x.x` | IPv4-mapped — checked against IPv4 blocklist too |

##### Escape hatch for TUN/fake-IP proxies

Proxy setups like Surge, Clash, or Mihomo rewrite public domains into reserved ranges (commonly `198.18.0.0/15`) to
perform transparent DNS/TLS interception. Those requests would normally be blocked.

Pass `allowRanges: string[]` (CIDR notation) on `FetchParams` to exempt specific ranges. The entries are validated
strictly — malformed CIDR throws, so a misconfigured whitelist cannot silently disable protection.

> **Note:** `allowRanges` is currently plumbed but not yet exposed as a configurable tool parameter. To use it, read the
> value from your extension config and pass it into `fetchUrl({ ..., allowRanges })` in `index.ts`.

#### Configuration

| Concern        | Where to edit                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------ |
| GitHub         | `DEFAULT_GITHUB_CONFIG` in [`types.ts`](./types.ts)                                              |
| HTTP fetch     | Timeouts (`DEFAULT_TIMEOUT_MS`, `MAX_TIMEOUT_MS`), size (`MAX_BYTES`), User-Agents in `types.ts` |
| SSRF whitelist | Read `allowRanges` from extension config → pass as `FetchParams.allowRanges` in `index.ts`       |

All defaults are defined in code — there is no external config file.
