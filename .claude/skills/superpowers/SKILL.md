---
name: superpowers
description: Guide for using obra/superpowers skills framework - systematic debugging, TDD, brainstorming, parallel agents, and more.
source: https://github.com/obra/superpowers
---

# Superpowers Skills Framework

Superpowers teaches Claude new skills and capabilities through structured methodologies. This skill provides access to battle-tested workflows for development tasks.

---

## Installation (One-time Setup)

```bash
# 1. Clone superpowers
git clone https://github.com/obra/superpowers ~/.claude/superpowers

# 2. Create personal skills directory
mkdir -p ~/.claude/skills
```

---

## Available Skills

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| **brainstorming** | Structured ideation before coding | Before ANY new feature |
| **test-driven-development** | TDD workflow | Writing new functionality |
| **systematic-debugging** | Methodical bug hunting | When fixing issues |
| **writing-plans** | Create execution plans | Complex multi-step tasks |
| **executing-plans** | Follow plans systematically | After planning phase |
| **verification-before-completion** | Final checks | Before marking done |
| **dispatching-parallel-agents** | Multi-agent coordination | Large parallel tasks |
| **subagent-driven-development** | Delegate to specialists | Complex features |
| **requesting-code-review** | Ask for review | Before merging |
| **receiving-code-review** | Handle feedback | After review received |
| **finishing-a-development-branch** | Clean up branch | Before merge |
| **using-git-worktrees** | Multiple branches simultaneously | Parallel development |

---

## Critical Rules

### 1. ALWAYS Brainstorm Before Coding

```markdown
Before writing ANY code:
1. List 3+ approaches
2. Evaluate pros/cons
3. Choose with reasoning
4. THEN implement
```

### 2. NEVER Skip TDD

```markdown
For new functionality:
1. Write failing test first
2. Implement minimal code to pass
3. Refactor
4. Repeat
```

### 3. Systematic Debugging

```markdown
When fixing bugs:
1. Reproduce the issue
2. Form hypothesis
3. Test hypothesis
4. Fix or revise hypothesis
5. Verify fix doesn't break other things
```

### 4. Verification Before Completion

```markdown
Before marking ANYTHING done:
- [ ] Code compiles/runs
- [ ] Tests pass
- [ ] Edge cases handled
- [ ] No regressions
- [ ] Documentation updated
```

---

## Workflow: New Feature Development

```markdown
## Phase 1: Brainstorm
- What problem are we solving?
- List 3+ approaches
- Choose best approach with reasoning

## Phase 2: Plan
- Break into small tasks
- Define acceptance criteria
- Identify risks

## Phase 3: TDD Implementation
For each task:
1. Write failing test
2. Implement
3. Refactor
4. Commit

## Phase 4: Verification
- All tests pass
- Manual testing
- Code review
- Documentation

## Phase 5: Finish
- Clean up branch
- Update changelog
- Create PR
```

---

## Workflow: Bug Fixing

```markdown
## Phase 1: Reproduce
- Get exact steps to reproduce
- Identify expected vs actual behavior
- Create failing test that captures the bug

## Phase 2: Investigate
- Form hypothesis about cause
- Add logging/debugging
- Test hypothesis

## Phase 3: Fix
- Make minimal change to fix
- Verify fix with test
- Check for regressions

## Phase 4: Verify
- Run full test suite
- Manual verification
- Document root cause
```

---

## Workflow: Parallel Development

```markdown
## When to use:
- Multiple independent features
- Large refactoring tasks
- Parallel testing scenarios

## How:
1. Create separate agents for each task
2. Define clear boundaries
3. Coordinate via shared state
4. Merge results systematically
```

---

## Tool Mapping (Claude Code)

| Superpowers Reference | Claude Code Equivalent |
|----------------------|------------------------|
| `update_plan` | `TodoWrite` tool |
| Subagents | `Task` tool with agents |
| Read/Write/Edit | Native Claude tools |
| Skills | `@~/.claude/skills/` |

---

## Quick Reference Commands

```bash
# List available skills
ls ~/.claude/superpowers/skills/

# Read a specific skill
cat ~/.claude/superpowers/skills/brainstorming/SKILL.md

# Use skill in conversation
@~/.claude/superpowers/skills/test-driven-development/SKILL.md
```

---

## Integration with DevOPS Kit

The superpowers methodology integrates with our existing agents:

| Agent | Superpowers Skill |
|-------|-------------------|
| Design | brainstorming → design decisions |
| Security | systematic-debugging → vulnerability hunting |
| API | test-driven-development → API development |
| Performance | verification-before-completion → optimization |

---

## Best Practices

### DO:
- ✅ Brainstorm before every feature
- ✅ Write tests first (TDD)
- ✅ Use systematic debugging
- ✅ Verify before marking done
- ✅ Document decisions

### DON'T:
- ❌ Skip brainstorming "to save time"
- ❌ Write code without tests
- ❌ Fix bugs by trial-and-error
- ❌ Mark done without verification
- ❌ Forget to update documentation

---

## Resources

- [Superpowers Repository](https://github.com/obra/superpowers)
- [Full Skills List](https://github.com/obra/superpowers/tree/main/skills)
- [Installation Guide](https://github.com/obra/superpowers/blob/main/.codex/INSTALL.md)

---

> **Remember**: If a skill applies to your task, you MUST use it. These workflows exist because they produce better results than ad-hoc approaches.
