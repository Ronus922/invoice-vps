---
name: agent-skills-2026
description: Agent Skills 2026 master skill — loads Code Reviewer, Excalidraw diagram generator, Google Workspace (Gmail/Calendar MCP), and Pentest framework. Inspired by "10 Must-Have Skills for Claude in 2026". Use for code quality review, architecture diagrams, GWS automation, or authorized penetration testing. Triggers: "agent skills 2026", "code review skill", "excalidraw diagram", "google workspace", "GWS", "pentest skill", "2026 skills".
---

# Agent Skills 2026

> 4 skills מהמאמר "10 Must-Have Skills for Claude in 2026".
> Code quality + Architecture diagrams + Google Workspace + Pentest.

---

## Skill Routing

```
קוד לreview?                → /code-reviewer      (complexity, duplication, SRP, N+1)
ציור diagram/ארכיטקטורה?    → /excalidraw         (JSON → Excalidraw → PNG)
Gmail / Google Calendar?    → /gws                (MCP tools, recipes מוכנים)
Pentest מאושר?              → /pentest            (OWASP Top 10, scope-controlled)
```

---

## Quick Reference

### /code-reviewer — 6 קטגוריות
| קטגוריה | בדיקה |
|---------|-------|
| Complexity | abstractions מיותרות, cyclomatic > 10 |
| Duplication | blocks חוזרים 2+, patterns דומים |
| SRP | "and" בשם הפונקציה → split |
| Performance | N+1, re-renders מיותרים |
| Dead Code | unused vars, unreachable, old TODOs |
| Naming | is/has/can booleans, verb+noun functions |

### /excalidraw — Element Types
| Type | שימוש |
|------|-------|
| rectangle | Service, component |
| ellipse | Database, external actor |
| diamond | Decision |
| arrow | Data flow |

### /gws — MCP Tools
| Category | Tools |
|----------|-------|
| Gmail | search, read, thread, draft, labels |
| Calendar | list, get, create, update, delete, find_times |

### /pentest — OWASP Coverage
| A01 | A02 | A03 | A04 | A05 | A07 | A10 |
|-----|-----|-----|-----|-----|-----|-----|
| Access Control | Crypto | Injection/XSS | Design | Misconfig | Auth | SSRF |

---

## Dual-Mode (Ruflo)

| Task | Platform |
|------|----------|
| Code review analysis | 🔵 Claude Code |
| Diagram JSON generation | 🔵 Claude Code |
| GWS workflow execution | 🔵 Claude Code (MCP direct) |
| Pentest recon + exploitation | 🔵 Claude Code |
| Code fixes after review | 🟢 Codex |
| Diagram rendering scripts | 🟢 Codex |

---

## Related Skills (DevOPS Kit)

| Skill | קשר |
|-------|-----|
| `/review-all` | `/code-reviewer` ← component של full review |
| `/doc-coauthoring` | `/excalidraw` ← diagrams בspecs/ADRs |
| `/workflows` | `/gws` ← n8n + GWS webhooks |
| `/security` | `/pentest` ← app security + pentest |
| `/anthropic-skills` | `/webapp-testing` ← browser testing complement |
