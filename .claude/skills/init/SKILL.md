---
name: init
description: Initialize or update project documentation (CLAUDE.md, PROJECT.md) based on codebase analysis
trigger_keywords:
  - "/init"
  - "initialize project"
  - "update project docs"
  - "analyze project structure"
---

# Init Skill - Project Documentation Initializer

## Purpose

Automatically analyze the current project and update `CLAUDE.md` and `PROJECT.md` with accurate, context-aware information.

## When to Use

- First time opening a project in Claude Code: `/init`
- After major changes to project structure
- When project docs are outdated or incomplete
- After upgrading the DevOPS Kit

## What This Skill Does

### 1. Analyze Project Structure

**Detect:**
- Framework (Next.js version, React Native, Expo)
- Tech stack (Tailwind, Supabase, TypeScript config)
- Folder structure (app/, components/, lib/, etc.)
- Package.json dependencies
- Environment variables (.env files)
- Testing setup (Playwright, Jest, Vitest)
- Git repository status

### 2. Update CLAUDE.md

**Auto-populate:**
- Project name (from package.json or folder name)
- Detected tech stack
- RTL/Hebrew if detected (check for `dir="rtl"` in layouts)
- Available skills in `.claude/skills/`
- Available agents in `.claude/agents/`
- Detected authentication system (Supabase Auth, NextAuth, etc.)
- Deployment info if found (vercel.json, netlify.toml)

**Keep existing:**
- Iron Rules (never change)
- Custom notes added by developer
- Project-specific guidelines

### 3. Update PROJECT.md

**Auto-populate:**
- Project name
- Current date
- Folder structure (actual, not template)
- Detected features (if you find auth, forms, etc.)
- Dependencies list
- Scripts from package.json
- Environment variables list (names only, no values)
- Git branch info

**Preserve existing:**
- Goals (if already defined)
- Completed work
- In progress tasks
- Important notes
- Links section

### 4. Report Changes

After updating, report:
- What was detected
- What was updated
- What was preserved
- Recommendations (missing deps, config issues, etc.)

---

## Execution Steps

When user runs `/init`:

```
1. READ & ANALYZE
   ├── Read package.json
   ├── Read tsconfig.json / jsconfig.json
   ├── Detect Next.js version (app/ vs pages/)
   ├── Check for Supabase config
   ├── Check for Tailwind config
   ├── List .env* files (don't read values)
   ├── Check testing setup
   ├── Read current CLAUDE.md
   └── Read current PROJECT.md

2. DETECT TECH STACK
   ├── Framework: Next.js 15 App Router / Pages Router / Expo
   ├── UI: Tailwind v3/v4, Shadcn UI, other
   ├── Backend: Supabase, Prisma, Drizzle, tRPC
   ├── Auth: Supabase Auth, NextAuth, Clerk
   ├── Language: TypeScript strict / loose / JavaScript
   ├── Testing: Playwright, Jest, Vitest, Cypress
   ├── Monorepo: Turborepo, pnpm workspace, none
   └── Mobile: Expo, React Native CLI, none

3. UPDATE CLAUDE.MD
   ├── Replace {{PROJECT_NAME}} with actual name
   ├── Update Stack section with detected stack
   ├── Verify skills list matches .claude/skills/
   ├── Verify agents list matches .claude/agents/
   ├── Add RTL section if Hebrew detected
   ├── Add custom sections if needed
   └── PRESERVE all custom developer notes

4. UPDATE PROJECT.MD
   ├── Replace {{PROJECT_NAME}} with actual name
   ├── Set {{DATE}} to today
   ├── Update folder structure to actual
   ├── Add "Detected Dependencies" section
   ├── Add "Available Scripts" from package.json
   ├── Add "Environment Variables" (names only)
   └── PRESERVE goals, completed, in-progress, notes, links

5. REPORT
   ├── "✅ CLAUDE.md updated"
   ├── "✅ PROJECT.md updated"
   ├── "📊 Detected: [stack details]"
   ├── "⚠️  Recommendations: [if any]"
   └── "💡 Next: Review and customize docs"

6. SAVE TO MEMORY (MCP)
   Save project info to persistent memory using mcp__memory tools:

   a. Create/update entity for this project:
      mcp__memory__create_entities({
        entities: [{
          name: "<project-name>",
          entityType: "project",
          observations: [
            "Server: <hostname>",
            "Path: <project-path>",
            "Stack: <detected-stack>",
            "Framework: <framework-version>",
            "UI: <tailwind-version>, <ui-library>",
            "Auth: <auth-system>",
            "DB: <database>",
            "Last init: <date>",
            "Status: <active/maintenance/archived>"
          ]
        }]
      })

   b. Create relations:
      mcp__memory__create_relations({
        relations: [
          { from: "<project-name>", relationType: "hosted_on", to: "<server-name>" },
          { from: "<project-name>", relationType: "uses", to: "<framework>" }
        ]
      })

   c. Update MEMORY.md (local):
      Add/update project entry in ~/.claude/projects/*/memory/MEMORY.md

   d. Report: "🧠 Saved to memory: <project-name> on <server>"
```

---

## Example Output

After running `/init` on a Next.js 15 + Supabase + Tailwind project:

```
🔍 Analyzing project...

📦 Detected:
  Framework: Next.js 15.1.4 (App Router)
  Language: TypeScript (strict mode)
  UI: Tailwind CSS v4.0.0, Shadcn UI
  Backend: Supabase (client + server)
  Auth: Supabase Auth
  Testing: Playwright configured
  RTL: Detected (Hebrew project)
  Skills: 17 available
  Agents: 9 available

✅ Updated CLAUDE.md
  - Set project name: "My CRM System"
  - Updated tech stack
  - Added RTL guidelines
  - Verified skills/agents list

✅ Updated PROJECT.md
  - Set project name and date
  - Updated folder structure (8 routes detected)
  - Added 23 dependencies
  - Added 8 npm scripts
  - Listed 5 environment variables

⚠️  Recommendations:
  - Consider adding .env.example for team onboarding
  - Missing Playwright test coverage for /dashboard route
  - Supabase RLS policies not detected (check security)

💡 Next steps:
  1. Review CLAUDE.md and add project-specific guidelines
  2. Fill PROJECT.md goals section
  3. Run /gsd:new-project if starting fresh workflow
```

---

## Smart Merge Logic

When updating existing files:

### For CLAUDE.md:
```
PRESERVE:
  - Iron Rules (never touch)
  - Custom sections added by developer
  - Project-specific notes

UPDATE:
  - Project name
  - Tech stack (only if changed)
  - Skills list (sync with .claude/skills/)
  - Agents list (sync with .claude/agents/)
```

### For PROJECT.md:
```
PRESERVE:
  - Goals (checkboxes state)
  - "What completed" section
  - "In progress" section
  - "Important notes" section
  - "Links" section

UPDATE:
  - Project name
  - Date
  - Folder structure
  - Dependencies
  - Scripts
  - Env vars list
```

---

## Error Handling

If `/init` encounters issues:

**Missing package.json:**
```
⚠️  No package.json found!
This doesn't look like a Node.js project.

Options:
1. Navigate to project root: cd /path/to/project
2. Initialize new project: npm init
3. This is not a Node.js project (skip)
```

**No CLAUDE.md:**
```
⚠️  No CLAUDE.md found!

Would you like me to:
1. Create CLAUDE.md from template ✓
2. Create PROJECT.md from template ✓
3. Copy skills to .claude/skills/ ✓
4. Copy agents to .claude/agents/ ✓

(This is equivalent to running: new-project . "Project Name")
```

**No .claude/ directory:**
```
⚠️  No .claude/ directory found!

Run this first:
  new-project . "$(basename $(pwd))"

Then run /init again.
```

---

## Memory Integration (MCP)

`/init` saves project metadata to persistent memory so Claude remembers projects across conversations.

### What Gets Saved:
- Project name, path, server
- Full tech stack (framework, UI, auth, DB)
- Last init date
- Project status

### Memory Tools Used:
```
mcp__memory__create_entities   → Create/update project entity
mcp__memory__create_relations  → Link project to server/framework
mcp__memory__add_observations  → Add new findings to existing project
mcp__memory__search_nodes      → Check if project already exists (avoid duplicates)
```

### Duplicate Prevention:
Before creating a new entity, always search first:
```
mcp__memory__search_nodes({ query: "<project-name>" })
```
- If found → use `mcp__memory__add_observations` to update
- If not found → use `mcp__memory__create_entities` to create

### Example Memory Entity:
```json
{
  "name": "SBenefit360",
  "entityType": "project",
  "observations": [
    "Server: sbenefit360.club",
    "Path: /var/www/sb360",
    "Stack: Next.js 15, React 19, Tailwind v4, Supabase",
    "Auth: Supabase Auth",
    "Monorepo: Turborepo (apps/web, packages/)",
    "Design: Brand colors in globals.css (orange #F59424, teal #4BADB8)",
    "Last init: 2026-02-08",
    "Status: active"
  ]
}
```

---

## Integration with DevOPS Kit

`/init` works seamlessly with:

- **new-project.sh** - Run `/init` after new-project to refine docs
- **upgrade.sh** - Run `/init` after upgrading kit
- **/gsd:new-project** - Automatically runs `/init` before planning
- **PROJECT.md** - Keeps it synced with reality
- **CLAUDE.md** - Ensures accurate context
- **MCP Memory** - Persists project knowledge across conversations

---

## Usage Examples

### Scenario 1: Fresh Project
```bash
# Terminal
new-project ~/projects/my-crm "My CRM"
cd ~/projects/my-crm
code .

# In Claude Code
/init

# Result: CLAUDE.md and PROJECT.md auto-filled with project details
```

### Scenario 2: Existing Project (first time opening)
```bash
cd ~/projects/old-project
code .

# In Claude Code
/init

# Result: CLAUDE.md and PROJECT.md updated based on actual codebase
```

### Scenario 3: After Major Changes
```javascript
// Added Supabase, changed from Pages to App Router, added Tailwind

// In Claude Code
/init

# Result: PROJECT.md updated with new stack, CLAUDE.md reflects changes
```

### Scenario 4: After DevOPS Kit Upgrade
```bash
# Terminal
cd ~/DevOPS && ./upgrade.sh

# In each project
cd ~/projects/my-app
code .

# In Claude Code
/init

# Result: Skills and agents lists updated to match new kit
```

---

## Technical Implementation

When executing `/init`, Claude should:

1. **Use Read tool** to examine:
   - `package.json`
   - `tsconfig.json` or `jsconfig.json`
   - `tailwind.config.js` or `tailwind.config.ts`
   - `next.config.js` or `next.config.ts`
   - `.env.example` (if exists)
   - `CLAUDE.md`
   - `PROJECT.md`

2. **Use Glob tool** to detect:
   - Folder structure: `src/app/`, `src/pages/`, `app/`, `pages/`
   - Skills: `.claude/skills/*/SKILL.md`
   - Agents: `.claude/agents/*.md`
   - Routes (App Router): `app/**/page.tsx`
   - Components: `components/**/*.tsx`

3. **Use Edit tool** to update:
   - `CLAUDE.md` - Smart merge with preservation
   - `PROJECT.md` - Smart merge with preservation

4. **Never use Write tool** - Always Edit to preserve content

---

## Iron Rule for /init

**NEVER destroy existing content.**

If unsure whether to replace or preserve a section:
- Default to PRESERVE
- Ask user: "I see custom content in [section]. Keep it? (y/N)"
- Only replace template placeholders like `{{PROJECT_NAME}}`

---

## Pro Tips

1. **Run /init regularly** - Especially after:
   - Installing new dependencies
   - Changing frameworks
   - Adding new features
   - Team members join (outdated docs)

2. **Combine with /gsd** - For structured development:
   ```
   /init                    # Update docs first
   /gsd:new-project         # Then plan phases
   ```

3. **Before asking Claude** - Run `/init` so Claude has accurate context

4. **After kit upgrade** - Run in all projects to sync skills/agents

---

## Hebrew Project Detection

If `/init` detects Hebrew (RTL):

**Checks for:**
- `dir="rtl"` in `app/layout.tsx` or `_app.tsx`
- `lang="he"` in HTML
- Hebrew strings in components
- RTL Tailwind classes (`ps-*`, `pe-*`, `ms-*`, `me-*`)

**Adds to CLAUDE.md:**
```markdown
## 🌐 RTL-First (עברית)
- `dir="rtl"` + `lang="he"` ב-html
- ps-*/pe-* במקום pl-*/pr-*
- ms-*/me-* במקום ml-*/mr-*
- בדוק נגישות עם NVDA/JAWS
- ודא תמיכה מלאה במקלדת
```

---

## Summary

**/init is your project documentation auto-updater:**

✅ Analyzes codebase automatically
✅ Updates CLAUDE.md with accurate context
✅ Updates PROJECT.md with current structure
✅ Preserves custom content
✅ Syncs skills and agents lists
✅ Detects tech stack changes
✅ Reports what changed
✅ Gives recommendations
✅ **Saves to MCP Memory** - project info persists across conversations

**Run it whenever your project docs feel stale.**
