# Claude Code — Course Curriculum

> **Daskibo Academy · Course 02**
> 21 Lessons · 12 Labs · ~35 hours

Claude Code is Anthropic's official AI-powered CLI that brings Claude's intelligence directly into your terminal and IDE. This course takes you from zero to building production-grade autonomous agents, covering every feature of the tool, API integration patterns, and real-world deployment strategies.

---

## Prerequisites

- Basic command-line familiarity
- Any programming language (examples use Python, TypeScript, and bash)
- Git basics
- (Optional) Familiarity with Antigravity IDE (Course 01)

---

## Lessons

### Module 1 — Foundations (Lessons 01–05)

| # | Title | Description |
|---|-------|-------------|
| 01 | **Getting Started with Claude Code** | Installation (npm, brew, apt), first run, API key setup, `claude --version`, and understanding the REPL vs non-interactive modes. |
| 02 | **The CLI Interface** | Command flags (`-p`, `--output-format`, `--max-turns`), stdin/stdout piping, JSON output, and scripting Claude from the shell. |
| 03 | **CLAUDE.md — Project Memory** | Writing effective `CLAUDE.md` files, scoping instructions (project vs user vs workspace), and how Claude reads them on startup. |
| 04 | **Plan Mode & Autonomous Execution** | Switching between interactive and autonomous modes, understanding Task Groups, and the `--dangerously-skip-permissions` flag and when to use it safely. |
| 05 | **Permissions & Security Model** | Allow/Deny lists for tools, the permission prompt system, sandboxing principles, and best practices for CI/CD contexts. |

### Module 2 — Tools & Context (Lessons 06–10)

| # | Title | Description |
|---|-------|-------------|
| 06 | **Built-in Tools Deep Dive** | Every native tool: `Read`, `Edit`, `Write`, `Bash`, `WebSearch`, `WebFetch`, `Agent` — parameters, limits, and when to prefer each. |
| 07 | **MCP Servers with Claude Code** | Connecting MCP servers via `claude mcp add`, the `.mcp.json` config file, scope levels (local/user/project), and debugging MCP connections. |
| 08 | **Custom Slash Commands** | Creating `/commands` in `.claude/commands/`, parameterised commands with `$ARGUMENTS`, and building a personal command library. |
| 09 | **Context Management** | The `--context-window-size` option, `compact` and `clear` commands, understanding token budgets, and prompt caching strategies. |
| 10 | **Subagents & Parallelism** | Spawning sub-agents with the `Agent` tool, foreground vs background tasks, `SendMessage` for multi-turn coordination, and worktree isolation. |

### Module 3 — Real-World Development (Lessons 11–15)

| # | Title | Description |
|---|-------|-------------|
| 11 | **Code Review Workflows** | Using Claude Code for automated PR reviews, the `/review` skill, integrating with GitHub via MCP, and writing actionable review prompts. |
| 12 | **Test-Driven Development with Claude** | TDD prompt patterns, generating test suites, running `pytest`/`jest`/`cargo test` in loop, and interpreting failure output automatically. |
| 13 | **Refactoring Large Codebases** | Chunking strategies, `.claudeignore`, incremental refactor loops, and working with 2M+ token context windows on monorepos. |
| 14 | **CI/CD Integration** | Running Claude Code headlessly in GitHub Actions, storing API keys as secrets, generating pipeline YAML, and auto-fixing lint failures. |
| 15 | **Debugging & Diagnostics** | Reading `~/.claude/` logs, diagnosing stuck runs, handling rate limits, recovering from interrupted sessions, and `--resume` flag usage. |

### Module 4 — Advanced Agent Patterns (Lessons 16–18)

| # | Title | Description |
|---|-------|-------------|
| 16 | **Hooks & Automation** | The `settings.json` hooks system — `PreToolUse`, `PostToolUse`, `Stop`, `Notification` — writing shell hooks, and real-time pipeline automation. |
| 17 | **Multi-Agent Orchestration** | Architect + specialist patterns, role-casting prompts, fan-out/fan-in coordination, and Grand Unified Workflow for team-scale tasks. |
| 18 | **Building Claude API Applications** | The Anthropic SDK (Python & TypeScript), prompt caching, tool use, streaming responses, batch processing, and managed agents. |

### Module 5 — Production & Ecosystem (Lessons 19–21)

| # | Title | Description |
|---|-------|-------------|
| 19 | **IDE Integrations** | VS Code and JetBrains extensions, keybindings, the status line, desktop app vs web vs CLI differences, and team configuration via `settings.json`. |
| 20 | **Security Hardening** | Prompt injection defences, sensitive-file exclusions, audit logging, least-privilege tool configs, and running in restricted environments. |
| 21 | **Capstone: Ship a Feature End-to-End** | Spec → plan → implement → test → review → deploy a real feature using Claude Code exclusively, demonstrating every module skill in combination. |

---

## Labs

### Hands-On Lab Work

| # | Title | Skills Practiced | Estimated Time |
|---|-------|-----------------|----------------|
| Lab 01 | **Install & Configure Claude Code** | CLI setup, API key, `CLAUDE.md` creation | 45 min |
| Lab 02 | **Pipe-Driven Scripting** | stdin/stdout, JSON mode, shell scripts calling `claude -p` | 60 min |
| Lab 03 | **Write Your First CLAUDE.md** | Project memory, scoped instructions, testing recall | 45 min |
| Lab 04 | **MCP Server Integration** | Add a custom MCP server, wire tools, validate in CLI | 75 min |
| Lab 05 | **Custom Slash Commands Library** | Build 5 reusable `/commands`, parameterise, share via repo | 60 min |
| Lab 06 | **TDD Loop with Claude** | Red-green-refactor loop, auto-fix on failures, coverage report | 90 min |
| Lab 07 | **Automated PR Review Bot** | GitHub Actions + Claude Code review, comment posting via MCP | 90 min |
| Lab 08 | **Refactor a Legacy Module** | Apply chunking strategy, `.claudeignore`, incremental commits | 75 min |
| Lab 09 | **Hooks: Pre-commit Linter** | Write a `PreToolUse` hook that runs ESLint before every Edit | 60 min |
| Lab 10 | **Multi-Agent Feature Sprint** | Architect + 2 specialist agents, fan-out tasks, merge results | 120 min |
| Lab 11 | **Anthropic SDK Mini-App** | Build a cached, tool-using Claude API app with streaming output | 90 min |
| Lab 12 | **End-to-End Capstone** | Full feature lifecycle: spec → code → tests → CI → deploy via Claude Code | 3 hr |

---

## Certification

Upon completing all 12 labs and submitting the Capstone (Lab 12), students receive a **Daskibo Academy — Claude Code Practitioner** on-chain certificate on the Unit Zero network.

Certificate includes:
- Wallet address of the recipient
- Course ID and completion timestamp (block timestamp)
- IPFS link to the verified capstone artefact

---

## Resources

- [Claude Code Official Docs](https://docs.anthropic.com/claude-code)
- [Anthropic API Reference](https://docs.anthropic.com/api)
- [Model Context Protocol Spec](https://modelcontextprotocol.io)
- [Unit Zero Explorer](https://explorer.unit0.dev)

---

*Daskibo Academy · Claude Code Course · © 2026*
