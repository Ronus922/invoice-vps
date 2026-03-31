---
name: ralph
description: Autonomous AI agent loop that runs Claude Code repeatedly until all PRD items are complete. Each iteration has fresh context, memory persists via git.
source: https://github.com/snarktank/ralph
---

# Ralph - Autonomous Agent Loop

Ralph runs Claude Code repeatedly until all PRD items are complete. Each iteration is a fresh instance with clean context. Memory persists via git history, `progress.txt`, and `prd.json`.

---

## Installation

The `/prd` skill is included in the DevOPS Kit. No external installation needed.

For the Ralph bash loop (optional):
```bash
# Clone Ralph runner (only needed for autonomous ./ralph.sh loop)
git clone https://github.com/snarktank/ralph ~/.claude/ralph
```

---

## Workflow

### Step 1: Create PRD

```
/prd Add [your feature description]
```

Outputs: `tasks/prd-[feature-name].md` + `prd.json`

### Step 2: Run Ralph

**Recommended: Run in background with tmux** (doesn't flood your conversation):

```bash
# Run Ralph in background tmux session
ralph-tmux.sh /path/to/project 10

# Check progress anytime
tail -20 /path/to/project/ralph-output.log
cat prd.json | jq '.userStories[] | {id,title,passes}'

# Watch live
tmux attach -t ralph-project-name

# Stop Ralph
tmux kill-session -t ralph-project-name
```

**Alternative: Run inline** (will flood your conversation):

```bash
./ralph.sh --tool claude [max_iterations]
```

---

## How It Works

```
┌─────────────────────────────────────────┐
│  1. Create feature branch               │
│  2. Pick highest priority story         │
│     where passes: false                 │
│  3. Implement that single story         │
│  4. Run quality checks (tsc, tests)     │
│  5. Commit if checks pass               │
│  6. Update prd.json (passes: true)      │
│  7. Append learnings to progress.txt    │
│  8. Repeat until ALL pass               │
└─────────────────────────────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `ralph.sh` | Bash loop spawning fresh instances |
| `prd.json` | User stories with `passes` status |
| `progress.txt` | Learnings for future iterations |
| `CLAUDE.md` | Prompt template for Claude Code |

---

## PRD.json Structure

```json
{
  "projectName": "My Feature",
  "branchName": "feature/my-feature",
  "userStories": [
    {
      "id": "US-001",
      "title": "Add login button",
      "priority": 1,
      "acceptanceCriteria": [
        "Button exists on header",
        "Clicking opens modal"
      ],
      "passes": false
    }
  ]
}
```

---

## Critical Rules

### 1. Small Tasks Only

Each story must complete in ONE context window:

```markdown
✅ Right-sized:
- Add a database column and migration
- Add a UI component to existing page
- Update a server action with new logic
- Add a filter dropdown to a list

❌ Too big (split these):
- "Build the entire dashboard"
- "Add authentication"
- "Refactor the API"
```

### 2. Fresh Context Per Iteration

Memory between iterations:
- ✅ Git history (commits)
- ✅ progress.txt (learnings)
- ✅ prd.json (task status)
- ❌ Everything else resets

### 3. Feedback Loops Required

Ralph only works with feedback loops:
- Typecheck catches type errors
- Tests verify behavior
- CI must stay green

### 4. UI Stories Need Browser Verification

```markdown
Acceptance Criteria:
- [ ] Button renders correctly
- [ ] Click handler works
- [ ] **Verify in browser using dev-browser skill**
```

---

## Commands

```bash
# Check progress
cat prd.json | jq '.userStories[] | {id, title, passes}'

# See learnings
cat progress.txt

# Check git history
git log --oneline -10

# Run with max 20 iterations
./ralph.sh --tool claude 20
```

---

## Stop Condition

When all stories have `passes: true`:
```
<promise>COMPLETE</promise>
```

Loop exits automatically.

---

## Integration with DevOPS Kit

| Use Case | Approach |
|----------|----------|
| New project | GSD → Ralph for execution |
| Clear PRD | Ralph directly |
| Complex decisions | GSD phases |
| Autonomous execution | Ralph loop |

### Combined Workflow

```markdown
1. /gsd:new-project (if needed)
2. /prd [feature description]   ← Creates PRD + prd.json
3. Run: ./ralph.sh --tool claude
4. Review commits when done
```

---

## Debugging

```bash
# Story stuck?
# Check if task is too big - split it

# Tests failing?
# Check progress.txt for learnings
# Ensure CI is green before Ralph

# Context filling up?
# Stories are too large - make them smaller
```

---

## Resources

- [Ralph Repository](https://github.com/snarktank/ralph)
- [Interactive Flowchart](https://snarktank.github.io/ralph/)
- [Original Ralph Pattern](https://ghuntley.com/ralph/)

---

> **Philosophy**: Each iteration is fresh. Memory lives in git. Tasks must be small. Let Ralph loop until done.
