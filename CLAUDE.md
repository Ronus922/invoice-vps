# 🎖️ Master Orchestrator

## כללי ברזל (מחייבים!)
1. **RTL First** - כל עיצוב מימין לשמאל
2. **Mobile First** - responsive תמיד
3. **TypeScript Strict** - אין `any`, אין `console.log`
4. **Gap Over Margin** - Parent שולט על ריווח
5. **תוכן לא נוגע בבורדר** - padding תמיד!
6. **Touch Target** - מינימום 44x44px
7. **globals.css = תוכן עניינים** - globals.css מכיל רק `@import` (30 שורות מקס). כל CSS בתת-קבצים ב-`app/styles/`. קובץ partial מקסימום 1500 שורות
8. **DRY Components** - מבנה שחוזר → קומפוננטה רוחבית עם props לתוכן/צבעים. אין קוד כפול!
9. **CSS Cleanup** - כשמוחקים/מבטלים אלמנט → תמיד שאל: "למחוק גם את ה-CSS שלו?" אל תשאיר CSS יתום!
10. **ניהול context (קריטי!)** - אחרי כל 2 משימות חייבים להריץ `/compact`. אם המשתמש מסרב - להזהיר: "השיחה תתקע בקרוב ולא יהיה אפשר לשחזר". לפני סגירה - `/end`. **אסור לחכות ל-3+ משימות בלי compact!**

## Minimum Padding (חובה!)
| Element | Minimum |
|---------|---------|
| Button | `px-4 py-2` |
| Card/Container | `p-4` |
| Input | `px-3 py-2` |
| Badge | `px-2 py-0.5` |
| Table Cell | `px-4 py-3` |
| List Item | `p-3` |
| Modal | `p-6` |

```tsx
// ✅ Always
<div className="border p-4">content</div>
<button className="border px-4 py-2">click</button>

// ❌ Never
<div className="border">content</div>
<button className="border">click</button>
```

---

## Ruflo — תמיד פעיל (ALWAYS ON)

**Ruflo/claude-flow v3 הוא שכבת האורקסטרציה הקבועה של כל שיחה.**

| פלטפורמה | אחריות |
|----------|--------|
| 🔵 Claude Code | ארכיטקטורה, אבטחה, בדיקות, code review, PRD |
| 🟢 Codex (OMX) | מימוש, ריפקטורינג, אופטימיזציה, boilerplate |

- כל החלטת ארכיטקטורה → כתוב לזיכרון: `npx claude-flow@v3alpha memory write --namespace collaboration`
- משימות מורכבות → `npx claude-flow-codex dual run --namespace collaboration`
- Swarm → `npx claude-flow@v3alpha swarm run --topology hierarchical --max-agents 8`
- תמיד `doctor --fix` לפני swarm
- `/ruflo` לטעינת הסקייל המלא

---

## OMX Runtime (ברירת מחדל תפעולית)
- `omx` מריץ את Codex תחת `oh-my-codex`
- עבודה רחבה, רב-קובצית, refactor, debug ארוך או handoff-heavy: ברירת המחדל היא `omx team`
- `om "<task>"` הוא ה־shortcut הראשי: `omx team 3:executor "<task>"`
- `/prompts:planner`, `/prompts:architect`, `/prompts:executor`, `/prompts:verifier` הם משטחי העבודה הדיפולטיים של OMX
- `omd` מפעיל `omx doctor --team`
- `omx team status <team>`, `omx team resume <team>`, `omx team shutdown <team>` הם כלי הבקרה
- לא מריצים `omx agents-init .` בפרויקט KIT רגיל; התבניות של ה־KIT הן ה־source of truth ל־`CLAUDE.md` ו־`AGENTS.md`

---

## Agent Selection Matrix
| Task Type | Primary Agent | Support Agents | Parallel? |
|-----------|---------------|----------------|-----------|
| UI/Component | Design | - | ❌ |
| Feature (UI+API) | Fullstack | Design, API, Security | ✅ |
| Bug (simple) | - | Explore | ❌ |
| Bug (complex) | Fullstack | Explore, Security | ✅ |
| Performance | Performance | API | ✅ |
| Content | Content | Design | ✅ |
| Security/Auth | Security | API | ✅ |
| Animation | Animation | Design | ✅ |
| Responsive | Mobile | Design | ✅ |
| Native Mobile | Native | API, Mobile | ✅ |
| Automation | n8n | API | ✅ |

## Agent Profiles

| Agent | Expertise | Skills | Triggers |
|-------|-----------|--------|----------|
| Design | UI/UX, Tailwind, RTL, A11y | /design, /components | עיצוב, UI, button, form |
| Security | Auth, RLS, Validation | /security, /supabase-auth | auth, login, RLS |
| API | Next.js, Supabase, DB | /api, /features | API, endpoint, query |
| Content | Hebrew copy, SEO | /content | תוכן, טקסט, copy |
| Performance | Web Vitals, Caching | /optimization | slow, optimize, cache |
| Animation | GSAP, Framer Motion | /animations | animation, scroll, parallax |
| Mobile | Responsive, 9 breakpoints | /mobile | responsive, מובייל, breakpoints |
| Native | React Native, Expo, Monorepo | /native | native, expo, app store |
| n8n | Automation, Webhooks | /workflows | automation, webhook |
| Fullstack | Everything | ALL | complex features |
| fs-dev | Hebrew + Playwright | /gsd, /prd, /fullstack-il | Hebrew instructions |

---

## Decision Trees

### Which Agent?
```
UI-only? → Design Agent
API-only? → API Agent
Auth/Security? → Security Agent
Content-only? → Content Agent
Performance? → Performance Agent
Animation? → Animation Agent
Mobile? → Mobile Agent
Automation? → n8n Agent
Multi-domain? → Fullstack Agent (or parallel)
```

### Parallel or Sequential?
```
Tasks independent? → Parallel
Task B needs Task A output? → Sequential
Exploration/debugging? → Sequential
Implementation? → Usually Parallel
```

---

## Task Decomposition Patterns

### Pattern A: New Feature
```
Input: "Add user profile page"
→ Design Agent: UI components (parallel)
→ API Agent: endpoints (parallel)
→ Security Agent: permissions (parallel)
```

### Pattern B: Bug Fix
```
Input: "Login broken"
→ Explore Agent: find cause (first)
→ Relevant Agent: fix (then)
→ fs-dev Agent: add test (last)
```

### Pattern C: Performance
```
Input: "Page slow"
→ Performance Agent: profile (first)
→ API Agent: optimize queries (parallel)
→ Design Agent: optimize renders (parallel)
```

### Pattern D: Content
```
Input: "Update landing page"
→ Content Agent: Hebrew text (parallel)
→ Design Agent: layout (parallel)
```

---

## Available Skills

| Skill | Purpose |
|-------|---------|
| /design | UI/UX, Tailwind, RTL |
| /components | Complex UI (toasts, tables) |
| /frontend-design | Creative high-quality UI |
| /ui-ux-pro-max | Advanced UI/UX for complex interfaces |
| /security | Auth, RLS, OWASP |
| /supabase-auth | Supabase auth patterns |
| /api | Backend, Server Actions |
| /features | Common patterns |
| /content | Hebrew copywriting |
| /optimization | Performance, Web Vitals |
| /animations | GSAP, Framer Motion |
| /mobile | Responsive - 9 breakpoints |
| /native | React Native, Expo, Monorepo |
| /workflows | n8n automation |
| /fullstack-il | Hebrew fullstack |
| /gsd | Get Shit Done |
| /prd | Product Requirements |
| /charts | Recharts RTL |
| /init | Update docs |
| /contentmaster | Article generation |
| /supabase-oauth-nextjs | OAuth PKCE — route.ts, cookies, Docker/Nginx (PYE9 production) |
| /migrations | Supabase DB migrations, safe schema changes, rollback |
| /monitoring | Sentry, Better Stack, Error Boundaries, health checks |
| /cost-optimization | Claude model selection, token budgeting, caching |
| /engineering-pro | Engineering Excellence — loads all 7 eng skills |
| /skill-security-auditor | Scan skills for injection/exfiltration before install |
| /incident-commander | IR framework — SEV1-4, PIR, RCA, stakeholder comms |
| /observability | SLI/SLO/SLA, burn rate alerts, Grafana dashboards |
| /self-improving | Memory lifecycle — /si:review, /si:promote, /si:extract |
| /spec-driven | Spec-first — 9 sections, FR-N, Given/When/Then ACs |
| /dependency-auditor | CVE scan, license compliance, supply chain |
| /docker-dev | /docker:optimize, /docker:compose, /docker:security |
| /anthropic-skills | Anthropic Official Skills master — MCP, skill-creator, docs, artifacts, testing |
| /mcp-builder | Build MCP servers — 4-phase: Research→Implement→Evaluate→Register |
| /skill-creator | Create/eval/improve skills — eval loop, benchmark, format |
| /doc-coauthoring | 3-stage doc workflow — Context→Refine→Reader Test |
| /web-artifacts-builder | React+shadcn/ui → single bundled HTML artifact |
| /webapp-testing | Playwright + server lifecycle — Reconnaissance-Then-Action |
| /agent-skills-2026 | Agent Skills 2026 master — Code Reviewer, Excalidraw, GWS, Pentest |
| /code-reviewer | Automated code quality — complexity, duplication, SRP, N+1, dead code |
| /excalidraw | Architecture diagrams from text → Excalidraw JSON → PNG |
| /gws | Google Workspace — Gmail + Calendar MCP recipes |
| /pentest | Authorized penetration testing — OWASP Top 10, scope-controlled |
| /keyboard-shortcuts | Keyboard shortcuts + CSS tooltips system — ShortcutDef, matcher, dialog, group-hover |

---

## Engineering Pro Agent

| Task | Agent | Skills |
|------|-------|--------|
| Incident / Outage | Engineering Pro | /incident-commander |
| SLO / Observability | Engineering Pro | /observability |
| Spec-Driven Feature | Engineering Pro | /spec-driven |
| Dependency / CVE | Engineering Pro | /dependency-auditor |
| Docker / Container | Engineering Pro | /docker-dev |
| Skill install safety | Engineering Pro | /skill-security-auditor |
| Memory lifecycle | Engineering Pro | /self-improving |

---

## Agent Skills 2026

| Task | Agent | Skills |
|------|-------|--------|
| Code Quality Review | Agent Skills 2026 | /code-reviewer |
| Architecture Diagram | Agent Skills 2026 | /excalidraw |
| Gmail / Calendar Automation | Agent Skills 2026 | /gws |
| Authorized Pentest | Agent Skills 2026 | /pentest |

---

## Anthropic Official Skills

| Task | Agent | Skills |
|------|-------|--------|
| Build MCP Server | Anthropic Skills | /mcp-builder |
| Create / Improve Skill | Anthropic Skills | /skill-creator |
| Write Doc / Spec / ADR | Anthropic Skills | /doc-coauthoring |
| Interactive HTML Artifact | Anthropic Skills | /web-artifacts-builder |
| Test Running Webapp | Anthropic Skills | /webapp-testing |

---

## ContentMaster
Use `/contentmaster` for article generation (branded, non-branded, multi-brand).
Triggers: "create article", "write article", "generate content"
