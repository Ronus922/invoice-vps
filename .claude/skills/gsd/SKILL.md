---
name: gsd
description: Get Shit Done - Meta-prompting system for structured, spec-driven development with Claude Code. Solves context rot and maintains quality throughout development cycles.
source: https://github.com/glittercowboy/get-shit-done
---

# GSD - Get Shit Done

A meta-prompting and context engineering system that enables solo developers to describe what they want built, have Claude implement it reliably, and verify results—without enterprise project management overhead.

---

## Installation

```bash
# Clone the repository
git clone https://github.com/glittercowboy/get-shit-done ~/.claude/gsd

# Run installer
cd ~/.claude/gsd && node bin/install.js
```

---

## Core Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/gsd:new-project` | Initialize project | Starting new project |
| `/gsd:discuss-phase` | Capture decisions | Before planning |
| `/gsd:plan-phase` | Create execution plans | After discussion |
| `/gsd:execute-phase` | Run plans in parallel | After planning |
| `/gsd:verify-work` | User acceptance testing | After execution |
| `/gsd:quick` | Ad-hoc tasks | Quick fixes |
| `/gsd:progress` | Show status | Check where you are |
| `/gsd:map-codebase` | Analyze existing code | Before major changes |
| `/gsd:new-milestone` | Start next version | After completing phase |

---

## Project Structure

```
.planning/
├── PROJECT.md           # Vision document
├── REQUIREMENTS.md      # Scoped v1/v2 requirements
├── ROADMAP.md           # Phase breakdown
├── STATE.md             # Decisions and blockers
├── config.json          # Project settings
├── research/            # Domain investigation
├── {phase}-CONTEXT.md   # Implementation decisions
├── {phase}-{N}-PLAN.md  # Atomic task plans
├── {phase}-{N}-SUMMARY.md # What was built
└── quick/               # Ad-hoc task tracking
```

---

## Core Workflow

### Phase 1: New Project

```bash
/gsd:new-project
```

Creates:
- PROJECT.md with vision
- REQUIREMENTS.md with scoped features
- ROADMAP.md with phases
- Initial research tasks

### Phase 2: Discuss

```bash
/gsd:discuss-phase 1.0
```

- Capture implementation decisions
- Resolve ambiguities
- Document technical choices

### Phase 3: Plan

```bash
/gsd:plan-phase 1.0
```

- Research domain deeply
- Create atomic task plans
- Verify plans before execution

### Phase 4: Execute

```bash
/gsd:execute-phase 1.0
```

- Run plans with fresh context
- Atomic git commits per task
- Parallel agent execution

### Phase 5: Verify

```bash
/gsd:verify-work
```

- User acceptance testing
- Automated debugging
- Fix issues in loops

---

## Key Concepts

### Context Engineering

GSD solves "context rot" - quality degradation as context window fills:

| Problem | GSD Solution |
|---------|--------------|
| Context fills up | Fresh 200k tokens per phase |
| Lost decisions | STATE.md preserves everything |
| Quality degrades | Verification loops |
| No structure | Atomic task plans |

### Plans as Prompts

PLAN.md files are executable, not documents to transform:

```xml
<task type="auto">
  <name>Task 1: Create user model</name>
  <files>src/models/user.ts</files>
  <action>Create User type with id, email, name fields</action>
  <verify>tsc --noEmit</verify>
  <done>User type exports correctly</done>
</task>
```

### Task Types

| Type | When Used |
|------|-----------|
| `type="auto"` | Claude executes autonomously |
| `type="checkpoint:human-verify"` | User must verify |
| `type="checkpoint:decision"` | User must choose |

---

## Quick Tasks

For ad-hoc work that doesn't need full planning:

```bash
/gsd:quick "fix the login button alignment"
```

GSD guarantees:
- Task tracked in `.planning/quick/`
- Atomic commit when done
- No context pollution

---

## Best Practices

### DO:
- ✅ Start with `/gsd:new-project` for new work
- ✅ Use `/gsd:discuss-phase` before planning
- ✅ Let plans verify before execution
- ✅ Use `/gsd:quick` for small fixes
- ✅ Run `/gsd:progress` when lost

### DON'T:
- ❌ Skip discussion phase
- ❌ Edit PLAN.md files manually
- ❌ Execute without verified plans
- ❌ Ignore checkpoint decisions
- ❌ Mix phases in same session

---

## Integration with DevOPS Kit

GSD works with our existing workflow:

| DevOPS Tool | GSD Integration |
|-------------|-----------------|
| Agents | Use in execute-phase |
| Skills | Load during planning |
| Templates | Base for PROJECT.md |
| TodoWrite | Maps to GSD tasks |

### Combined Workflow

```markdown
1. /gsd:new-project
2. Load relevant skills (@DESIGN.md, @API.md)
3. /gsd:discuss-phase with agent input
4. /gsd:plan-phase
5. /gsd:execute-phase with specialized agents
6. /gsd:verify-work
```

---

## Technical Guarantees

| Guarantee | How |
|-----------|-----|
| Fresh context | Subagent delegation |
| Plans work | Verification loops |
| Clean history | Atomic commits |
| Preserved decisions | STATE.md files |
| No degradation | Phase isolation |

---

## Resources

- [GSD Repository](https://github.com/glittercowboy/get-shit-done)
- [Installation Guide](https://github.com/glittercowboy/get-shit-done#installation)
- [GSD Style Guide](https://github.com/glittercowboy/get-shit-done/blob/main/GSD-STYLE.md)

---

> **Philosophy**: GSD optimizes for solo developer + Claude workflow. No enterprise patterns, no overhead—just get shit done.
