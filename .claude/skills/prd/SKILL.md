---
name: prd
description: Product Requirements Document generator - Creates structured PRDs with user stories, acceptance criteria, and prd.json for Ralph automation loop.
---

# PRD - Product Requirements Document

Generate structured, actionable PRDs that work with both Ralph (autonomous loop) and GSD (phased development).

---

## Quick Start

```
/prd [feature description]
```

Example:
```
/prd Add Google OAuth login with protected dashboard
```

---

## Workflow

### Step 1: Clarifying Questions

Before writing, ask **3-5 essential questions** to eliminate ambiguity:

```
I need a few clarifications before creating the PRD:

1. Target users?
   A) Admin only  B) All registered users  C) Public visitors  D) Other

2. Scope?
   A) MVP - minimum viable  B) Full feature  C) Phase 1 of multi-phase

3. Authentication method?
   A) Supabase Auth (Google OAuth)  B) Email/Password  C) Both  D) Magic Link

4. Priority?
   A) Critical - blocking  B) High - needed soon  C) Medium - planned  D) Low - nice to have

Answer concisely: e.g., "1B, 2A, 3C, 4B"
```

**Rules:**
- Maximum 5 questions
- Always provide lettered options (A, B, C, D)
- Cover: scope, users, priority, key decisions
- Accept concise answers ("1A, 2C, 3B")

### Step 2: Generate PRD

Create a structured markdown document with these sections:

```markdown
# PRD: [Feature Name]

## 1. Overview
[2-3 sentences: what this feature does and why it matters]

## 2. Goals
- Goal 1: [specific, measurable outcome]
- Goal 2: [specific, measurable outcome]
- Goal 3: [specific, measurable outcome]

## 3. User Stories

### US-001: [Story Title]
**As a** [user type],
**I want** [action/feature],
**So that** [benefit/outcome].

**Acceptance Criteria:**
- [ ] [Concrete, verifiable criterion]
- [ ] [Concrete, verifiable criterion]
- [ ] [Concrete, verifiable criterion]

**Priority:** [1-Critical | 2-High | 3-Medium | 4-Low]

### US-002: [Story Title]
...

## 4. Functional Requirements
- FR-1: [Explicit requirement]
- FR-2: [Explicit requirement]
- FR-3: [Explicit requirement]

## 5. Non-Goals (Out of Scope)
- [What this feature does NOT include]
- [Explicit boundary]

## 6. Technical Considerations
- Stack: Next.js 15, Supabase, Tailwind v4
- Auth: [Supabase Auth / as determined]
- Database: [Tables, RLS policies needed]
- API: [Server Actions / Route Handlers needed]

## 7. Design Considerations
- RTL/Hebrew: [Yes/No and specifics]
- Mobile responsive: [Requirements]
- Accessibility: [WCAG AA requirements]

## 8. Success Metrics
- [Measurable metric 1]
- [Measurable metric 2]

## 9. Open Questions
- [Unresolved question 1]
- [Unresolved question 2]
```

### Step 3: Save Files

Output TWO files:

**1. Markdown PRD:**
```
tasks/prd-[feature-name].md
```

**2. Ralph-compatible JSON:**
```
prd.json
```

---

## User Story Rules

### Size: One Context Window

Each story must be completable in a single Claude Code session:

```
Right-sized:
- "Add login button to header that opens auth modal"
- "Create dashboard layout with sidebar navigation"
- "Add RLS policy for user-owned records"
- "Create API endpoint for fetching user profile"

Too big (split these):
- "Build the entire authentication system"
- "Create the full dashboard"
- "Implement all CRUD operations"
```

### Writing Style

Target: **a junior developer or AI agent** should understand exactly what to build.

```
Bad:  "The system should handle errors appropriately"
Good: "Display red toast notification with error message when API call fails.
       Toast auto-dismisses after 5 seconds. Show retry button for network errors."

Bad:  "Implement user authentication"
Good: "Add Google OAuth button to /login page using Supabase Auth.
       On success: redirect to /dashboard.
       On failure: show error toast with specific message."
```

### Acceptance Criteria Rules

- Every criterion must be **verifiable** (yes/no testable)
- Include **edge cases**: empty state, error state, loading state
- UI stories must include: "Verify visually in browser"
- Auth stories must include: "Test with unauthenticated user"

### Priority System

| Priority | Meaning | Ralph Order |
|----------|---------|-------------|
| 1 | Critical - blocking other work | First |
| 2 | High - core functionality | Second |
| 3 | Medium - important but not blocking | Third |
| 4 | Low - nice to have | Last |

---

## prd.json Format

```json
{
  "projectName": "Feature Name",
  "branchName": "feature/feature-name",
  "userStories": [
    {
      "id": "US-001",
      "title": "Add Google OAuth login button",
      "description": "As a visitor, I want to sign in with Google so that I can access the dashboard.",
      "priority": 1,
      "acceptanceCriteria": [
        "Google OAuth button visible on /login page",
        "Clicking opens Google consent screen",
        "Successful auth redirects to /dashboard",
        "Failed auth shows error toast",
        "Unauthenticated users redirected from /dashboard to /login"
      ],
      "technicalNotes": "Use Supabase Auth with client-side callback (not route handler). See /supabase-auth skill.",
      "passes": false
    },
    {
      "id": "US-002",
      "title": "Create dashboard layout",
      "description": "As a logged-in user, I want to see a dashboard so that I can access my data.",
      "priority": 2,
      "acceptanceCriteria": [
        "Dashboard renders at /dashboard",
        "Shows user name from Supabase session",
        "Sidebar navigation with links",
        "RTL layout with proper Hebrew typography",
        "Responsive: works on mobile (375px)"
      ],
      "technicalNotes": "Use Shadcn sidebar component. RTL-first with ps-/pe- classes.",
      "passes": false
    }
  ]
}
```

### prd.json Rules

- `id`: Sequential `US-001`, `US-002`, etc.
- `priority`: Integer 1-4 (Ralph picks lowest number first)
- `passes`: Always `false` initially (Ralph sets to `true` when done)
- `acceptanceCriteria`: Plain strings (not markdown checkboxes)
- `technicalNotes`: Reference relevant skills (/supabase-auth, /design, etc.)
- `branchName`: kebab-case with `feature/` prefix

---

## Integration

### With Ralph

```
1. /prd [feature description]     ← Creates PRD + prd.json
2. /ralph                          ← Loads Ralph skill
3. ./ralph.sh --tool claude        ← Runs autonomous loop
```

Ralph reads `prd.json`, picks highest priority story with `passes: false`, implements it, runs checks, commits, marks `passes: true`, repeats.

### With GSD

```
1. /prd [feature description]     ← Creates PRD
2. /gsd:new-project               ← Uses PRD as input for phases
3. /gsd:discuss-phase 1            ← Discuss based on PRD stories
4. /gsd:plan-phase 1               ← Plan from PRD requirements
```

The markdown PRD (`tasks/prd-*.md`) feeds directly into GSD's planning workflow.

### Standalone

```
/prd [feature description]
```

Just creates the PRD documents. Use as reference for manual development.

---

## Stack-Aware Defaults

PRDs generated by this skill assume our stack unless specified otherwise:

| Layer | Default |
|-------|---------|
| Frontend | Next.js 15 (App Router) + React 19 |
| Styling | Tailwind v4 + Shadcn UI |
| Auth | Supabase Auth (see /supabase-auth) |
| Database | Supabase PostgreSQL + RLS |
| API | Server Actions (prefer) / Route Handlers |
| Language | TypeScript strict mode |
| Direction | RTL-first (Hebrew) |
| Testing | Playwright E2E |

### Skill References in Technical Notes

When a story involves a specific domain, reference the relevant skill:

| Domain | Reference |
|--------|-----------|
| Auth / OAuth / Login | `/supabase-auth` |
| UI / Components | `/design` + `/frontend-design` |
| API / Database | `/api` |
| Security / RLS | `/security` |
| Hebrew text | `/content` |
| Animations | `/animations` |
| Performance | `/optimization` |

---

## Example: Complete PRD

### Input
```
/prd Add contact management with search and filters for CRM
```

### Output: tasks/prd-contact-management.md

```markdown
# PRD: Contact Management

## 1. Overview
Add a contacts page to the CRM where users can view, search, and filter
their contacts. Includes table view with pagination, search by name/email,
and filter by status and date range.

## 2. Goals
- Goal 1: Users can find any contact within 3 seconds
- Goal 2: Support 10,000+ contacts without performance degradation
- Goal 3: Mobile-friendly contact browsing

## 3. User Stories

### US-001: Contact List Table
**As a** CRM user,
**I want** to see my contacts in a table,
**So that** I can quickly scan and manage them.

**Acceptance Criteria:**
- [ ] Table displays: name, email, phone, status, created date
- [ ] Sorted by created date (newest first) by default
- [ ] Pagination: 25 per page with page controls
- [ ] RTL layout with Hebrew column headers
- [ ] Loading skeleton while data fetches
- [ ] Empty state: "No contacts yet" with add button
- [ ] Verify visually in browser

**Priority:** 1

### US-002: Search Contacts
**As a** CRM user,
**I want** to search contacts by name or email,
**So that** I can find specific people quickly.

**Acceptance Criteria:**
- [ ] Search input at top of contacts page
- [ ] Debounced search (300ms delay)
- [ ] Searches name and email columns
- [ ] Shows "No results for [query]" when empty
- [ ] Clears with X button
- [ ] Works with Hebrew text

**Priority:** 2

### US-003: Filter by Status
**As a** CRM user,
**I want** to filter contacts by status,
**So that** I can focus on specific groups.

**Acceptance Criteria:**
- [ ] Dropdown filter: All, Active, Inactive, Lead
- [ ] Combines with search (AND logic)
- [ ] Shows count of filtered results
- [ ] Persists filter on page refresh (URL params)

**Priority:** 3
```

### Output: prd.json

```json
{
  "projectName": "Contact Management",
  "branchName": "feature/contact-management",
  "userStories": [
    {
      "id": "US-001",
      "title": "Contact List Table",
      "priority": 1,
      "acceptanceCriteria": [
        "Table displays: name, email, phone, status, created date",
        "Sorted by created date (newest first) by default",
        "Pagination: 25 per page with page controls",
        "RTL layout with Hebrew column headers",
        "Loading skeleton while data fetches",
        "Empty state with add button",
        "Verify visually in browser"
      ],
      "technicalNotes": "Use /design for table patterns, /api for Supabase query with pagination",
      "passes": false
    },
    {
      "id": "US-002",
      "title": "Search Contacts",
      "priority": 2,
      "acceptanceCriteria": [
        "Search input at top of contacts page",
        "Debounced search (300ms delay)",
        "Searches name and email columns",
        "Shows no results message when empty",
        "Clears with X button",
        "Works with Hebrew text"
      ],
      "technicalNotes": "Use Supabase .ilike() for search. See /components for search input pattern",
      "passes": false
    },
    {
      "id": "US-003",
      "title": "Filter by Status",
      "priority": 3,
      "acceptanceCriteria": [
        "Dropdown filter: All, Active, Inactive, Lead",
        "Combines with search (AND logic)",
        "Shows count of filtered results",
        "Persists filter on page refresh (URL params)"
      ],
      "technicalNotes": "Use nuqs for URL state. See /components for filter patterns",
      "passes": false
    }
  ]
}
```

---

## Checklist Before Saving

Before outputting the PRD, verify:

- [ ] Every user story fits in ONE context window
- [ ] Every acceptance criterion is verifiable (yes/no)
- [ ] Priorities are assigned (1-4)
- [ ] UI stories include "Verify visually in browser"
- [ ] Auth stories reference /supabase-auth
- [ ] Edge cases covered: empty, error, loading states
- [ ] Technical notes reference relevant skills
- [ ] prd.json matches markdown PRD exactly
- [ ] Branch name is kebab-case with feature/ prefix
- [ ] No vague language ("appropriate", "properly", "correctly")
