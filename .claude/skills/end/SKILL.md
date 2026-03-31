---
name: end
description: End of Day - summarize work, update docs, commit, plan next session
trigger_keywords:
  - "/end"
  - "end of day"
  - "wrap up"
---

# End - End of Day / End of Session

## Purpose

Structured end-of-day wrap-up: analyze what was done, update documentation, commit changes, and prepare for the next session. Adapts automatically to the project context.

## When to Use

- End of a work day
- End of a coding session
- Before switching to a different project
- When you want to document progress and plan ahead

## Smart Detection

Before starting, detect what's available and adapt:

| Detected | Action |
|----------|--------|
| `.git/` exists | Use git log, diff, status for analysis |
| `PROJECT.md` exists | Update status sections (in-progress → completed) |
| `.planning/` exists (GSD) | Check STATE.md, update phase progress |
| None of the above | Conversation-based summary only |

## Execution Flow

Execute ALL steps in order. Skip steps that don't apply based on smart detection.

### Step 1: Analyze Today's Work

**If Git repo exists:**

```bash
# Today's commits
git log --since="6am" --oneline

# Uncommitted changes
git diff --stat

# Current state
git status
```

**Also scan for:**
- New `TODO` or `FIXME` comments added in today's changes
- Files modified today: `git diff --name-only HEAD~5` (approximate)

**If no Git repo:**
- Ask the user: "What did you work on today?"
- Review recently modified files if possible

### Step 2: Present Summary to User

Present a clear summary in this format:

```
## EOD Summary

### Commits Today
- [list of today's commits]

### Uncommitted Changes
- [list of modified/untracked files]

### New TODOs Found
- [any TODO/FIXME from today's changes]
```

Ask: **"Anything to add or correct before I update the docs?"**

Wait for user confirmation before proceeding.

### Step 3: Update PROJECT.md

**If PROJECT.md exists:**

1. Move completed items from "In Progress" (🔄) to "Completed" (✅)
2. Update goal checkboxes based on what was accomplished
3. Add any important notes the user mentioned
4. Update the date/timestamp

**Keep existing format** - don't restructure, just update content.

### Step 4: Git Commit (if applicable)

**Only if:** Git repo exists AND there are uncommitted changes (including PROJECT.md updates from step 3).

```bash
git add -A
git commit -m "docs: EOD update - [brief summary of today's work]"
```

**DO NOT push** - the user decides when to push.

### Step 5: Run /init

Invoke the `/init` skill to refresh CLAUDE.md and PROJECT.md based on current codebase state. This catches:
- New dependencies added during the day
- Structural changes (new directories, files)
- Updated scripts or commands

### Step 6: Git Commit Documentation (if applicable)

**Only if:** Git repo exists AND /init made changes to tracked files.

```bash
git add CLAUDE.md PROJECT.md
git commit -m "docs: refresh project documentation via /init"
```

### Step 7: Plan Next Session

Present a forward-looking summary:

```
## Next Session

### Remaining Goals
- [unchecked items from PROJECT.md]

### Blockers / Dependencies
- [anything flagged during the session]

### Suggested Priorities
1. [highest priority task]
2. [second priority]
3. [third priority]

### Recommended Agent
- [suggest which agent fits the next task best]
```

### Step 8: Compact

Run `/compact` to compress the conversation context, ensuring a clean start for the next session.

## Output Format

The final EOD report should look like:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📋 EOD Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✅ What was done:
     - [item 1]
     - [item 2]
     - [item 3]

  📝 Documentation:
     - PROJECT.md updated
     - CLAUDE.md refreshed via /init

  💾 Git:
     - 2 commits created
     - Branch: main (not pushed)

  📌 Next session priorities:
     1. [priority 1]
     2. [priority 2]

  🤖 Suggested agent: [agent name]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Notes

- This skill is **interactive** - it asks the user for confirmation before making changes
- Never push to remote automatically
- If there's nothing to commit, skip Git steps silently
- The /init and /compact steps are always executed regardless of Git status
- Keep the summary concise and scannable
