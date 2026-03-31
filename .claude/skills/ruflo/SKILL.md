---
name: ruflo
description: Ruflo / claude-flow v3 — Dual-Mode AI Orchestration (Claude Code + Codex). Full MCP setup, diagnostics, swarm agents, shared memory, 3-tier routing.
---

# Ruflo — Dual-Mode AI Orchestration

> **Core premise:** Every task runs in Dual-Mode — Claude Code (🔵) handles Architecture/Security/Testing, Codex (🟢) handles Implementation/Optimization/Refactoring. Shared HNSW memory keeps both in sync.

---

## Installation & Setup

### Option A — Wizard (recommended)
```bash
npx ruflo@latest init --wizard
```

### Option B — Direct install
```bash
curl -fsSL https://cdn.jsdelivr.net/gh/ruvnet/ruflo@main/scripts/install.sh | bash
```

### Verify installation
```bash
npx claude-flow@v3alpha doctor --fix
```

---

## MCP Registration (Claude Code)

Add claude-flow as an MCP server so all 313 tools are available in Claude Code:

```bash
claude mcp add claude-flow npx claude-flow@v3alpha mcp start
```

Verify:
```bash
claude mcp list
# should show: claude-flow  npx claude-flow@v3alpha mcp start
```

Start the daemon:
```bash
npx claude-flow@v3alpha start --daemon
```

---

## Environment Variables

Add to `~/.bashrc` or `~/.zshrc` (and to any project `.env.local`):

```bash
# Core
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."          # for Codex side

# Agent Teams (Claude Code experimental)
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# Ruflo config
export CLAUDE_FLOW_MEMORY_BACKEND=hnsw  # vector memory
export CLAUDE_FLOW_SWARM_MAX_AGENTS=8
export CLAUDE_FLOW_CONSENSUS=raft       # anti-drift
```

---

## settings.json (Claude Code)

In `~/.claude/settings.json` add:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "mcpServers": {
    "claude-flow": {
      "command": "npx",
      "args": ["claude-flow@v3alpha", "mcp", "start"]
    }
  }
}
```

---

## Dual-Mode Integration

### Platform Responsibilities

| Platform | Role | Best For |
|----------|------|----------|
| 🔵 Claude Code | Architect + Guardian | Architecture, Security, Testing, Code review |
| 🟢 Codex | Implementer + Optimizer | Implementation, Refactoring, Optimization, Boilerplate |

### Starting Dual-Mode Session

```bash
# Install Codex package
npm install -g @claude-flow/codex

# Run dual-mode session
npx claude-flow-codex dual run --namespace collaboration

# Or with a specific template:
npx claude-flow-codex dual run --template feature --namespace collaboration
```

### Collaboration Templates

| Template | Use When |
|----------|----------|
| `feature` | New feature from PRD/spec |
| `security` | Auth, RLS, OWASP hardening |
| `refactor` | Code cleanup, DRY, performance |
| `bugfix` | Debugging + root cause fix |

```bash
npx claude-flow-codex dual run --template feature
npx claude-flow-codex dual run --template security
npx claude-flow-codex dual run --template refactor
npx claude-flow-codex dual run --template bugfix
```

### Shared Memory

Both platforms share the same HNSW vector memory namespace:

```bash
# Write to shared memory (Claude Code)
npx claude-flow@v3alpha memory write --key "arch-decision" --value "..." --namespace collaboration

# Read from shared memory (Codex)
npx claude-flow@v3alpha memory read --key "arch-decision" --namespace collaboration

# List all shared keys
npx claude-flow@v3alpha memory list --namespace collaboration
```

---

## Swarm Orchestration

### Topology: Hierarchical (Anti-Drift)

```bash
npx claude-flow@v3alpha swarm run \
  --topology hierarchical \
  --max-agents 8 \
  --consensus raft \
  --task "your complex task here"
```

### Swarm with Existing Agents

Map existing DevOPS agents to swarm roles:

```bash
npx claude-flow@v3alpha swarm run \
  --topology hierarchical \
  --agents "design,security,api,qa,fullstack" \
  --task "build feature X"
```

### Swarm Topologies

| Topology | Use When |
|----------|----------|
| `hierarchical` | Complex multi-domain tasks (default, anti-drift) |
| `mesh` | Peer-to-peer collaboration, no single coordinator |
| `ring` | Sequential pipeline tasks |
| `star` | One coordinator + many specialists |

---

## 3-Tier Model Routing

Ruflo auto-routes tasks by complexity:

| Tier | Runtime | Cost | Use For |
|------|---------|------|---------|
| WASM | <1ms | $0 | Regex, format checks, simple transforms |
| Haiku | ~1s | $0.0001 | Quick classification, short generation |
| Sonnet/Opus | 5-30s | $$$ | Architecture, complex reasoning, code |

Force a tier:
```bash
npx claude-flow@v3alpha run --tier haiku "classify this text"
npx claude-flow@v3alpha run --tier opus "design the auth architecture"
```

---

## Hooks & Workers

### 17 Available Hooks

```bash
npx claude-flow@v3alpha hooks list
# pre-task, post-task, pre-edit, post-edit,
# pre-bash, post-bash, pre-mcp, post-mcp,
# on-error, on-memory-write, on-agent-spawn,
# on-swarm-complete, on-consensus, ...
```

### Configure hooks in `.claude/hooks.json`:

```json
{
  "hooks": {
    "pre-edit": "npx claude-flow@v3alpha hooks run pre-edit",
    "post-task": "npx claude-flow@v3alpha hooks run post-task"
  }
}
```

### 12 Background Workers

```bash
npx claude-flow@v3alpha workers list      # show all workers
npx claude-flow@v3alpha workers start     # start all background workers
npx claude-flow@v3alpha workers status    # check running workers
```

Workers include: memory-indexer, swarm-monitor, consensus-voter, sona-learner, metrics-collector...

---

## SONA Self-Learning

SONA (Self-Optimizing Neural Agent) learns from your patterns:

```bash
# Enable SONA
npx claude-flow@v3alpha sona enable

# View what SONA learned
npx claude-flow@v3alpha sona report

# Reset learning (if wrong patterns accumulated)
npx claude-flow@v3alpha sona reset
```

---

## Diagnostics

```bash
# Full system check + auto-fix
npx claude-flow@v3alpha doctor --fix

# MCP connection test
npx claude-flow@v3alpha mcp test

# Memory system status
npx claude-flow@v3alpha memory status

# Swarm health
npx claude-flow@v3alpha swarm status

# Full system info
npx claude-flow@v3alpha info
```

---

## Integration with DevOPS Agent Roster

Ruflo orchestrates the existing agents — each keeps its own skill domain:

| Agent | Platform | Ruflo Role | Skills |
|-------|----------|------------|--------|
| Design | 🔵 Claude | UI Architect | /design, /design-pro, /ui-details |
| Security | 🔵 Claude | Security Guardian | /security, /supabase-auth |
| API | 🔵 Claude | Backend Architect | /api, /features |
| QA | 🔵 Claude | Test Architect | /qa |
| Content | 🔵 Claude | Copy Strategist | /content, /contentmaster |
| Fullstack | 🔵 Claude | Coordinator | ALL |
| Clone Website | 🔵 Claude | Reverse Engineer | /clone-website, /design-pro |
| Performance | 🟢 Codex | Optimizer | /optimization |
| Mobile | 🟢 Codex | Native Builder | /native, /mobile |
| n8n | 🟢 Codex | Automation Builder | /workflows |
| Animations | 🟢 Codex | Motion Coder | /animations |
| fs-dev | 🔵/🟢 Both | Hebrew Dev | /fullstack-il, /gsd |

### Which Platform Handles What

**🔵 Claude Code always owns:**
- Architecture decisions
- Security architecture + RLS policies
- Test strategy + Playwright specs
- Code review + quality gates
- PRD → spec decomposition

**🟢 Codex always owns:**
- Boilerplate generation
- Refactoring passes
- Performance micro-optimizations
- Pattern repetition across files
- Documentation generation

---

## Workflow Patterns

### Pattern: New Feature (Dual-Mode)

```bash
# 1. Claude Code: architecture + specs
/master → decompose into tasks

# 2. Start dual session
npx claude-flow-codex dual run --template feature --namespace collaboration

# 3. Claude writes to shared memory
npx claude-flow@v3alpha memory write --key "feature-spec" --value "..." --namespace collaboration

# 4. Codex reads spec → implements
# 5. Claude reviews + hardens security
# 6. QA agent runs Playwright
```

### Pattern: Complex Bug

```bash
npx claude-flow-codex dual run --template bugfix
# Claude: root cause analysis
# Codex: applies fix across all affected files
# Claude: writes regression test
```

### Pattern: Parallel Sections (clone-website style)

```bash
npx claude-flow@v3alpha swarm run \
  --topology hierarchical \
  --max-agents 6 \
  --task "build sections: hero, nav, features, pricing, footer in parallel"
```

---

## Quick Commands

```bash
# Start everything
npx ruflo@latest init --wizard        # first time
npx claude-flow@v3alpha start --daemon  # subsequent

# Dual-mode session
npx claude-flow-codex dual run --namespace collaboration

# Swarm task
npx claude-flow@v3alpha swarm run --topology hierarchical --task "..."

# Memory
npx claude-flow@v3alpha memory write --key KEY --value VALUE --namespace collaboration
npx claude-flow@v3alpha memory read --key KEY --namespace collaboration

# Diagnostics
npx claude-flow@v3alpha doctor --fix
```

---

## Triggers

- "ruflo", "claude-flow", "dual-mode"
- "swarm", "orchestrate agents"
- "parallel agents מתקדם"
- "Claude + Codex ביחד"
- "shared memory"
- `/ruflo`
