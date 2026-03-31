---
name: anthropic-skills
description: Anthropic official skills suite — master skill loading MCP Builder, Skill Creator, Doc Co-Authoring, Web Artifacts Builder, and Web App Testing. From the official anthropics/skills repo (105K stars). Use for MCP server development, skill creation/evaluation, documentation writing, interactive HTML artifacts, or webapp testing. Triggers: "anthropic skills", "mcp builder", "skill creator", "doc coauthoring", "web artifact", "webapp testing", "official skills".
---

# Anthropic Official Skills

> 5 skills מה-repo הרשמי של Anthropic (`anthropics/skills` — 105K ⭐).
> מותאמים לסביבת DevOPS Kit.

---

## Skill Routing

```
🔌 MCP Server?      → /mcp-builder        (חיבור API חיצוני ל-Claude)
🛠 צור/שפר Skill?   → /skill-creator      (eval loop, benchmark, format)
📄 כתיבת מסמך?     → /doc-coauthoring    (3 stages: context→refine→reader test)
🎨 HTML Artifact?   → /web-artifacts-builder (React+shadcn → HTML יחיד)
🧪 Test Webapp?     → /webapp-testing     (Playwright + server lifecycle)
```

---

## Dual-Mode (Ruflo)

| Task | Platform |
|------|----------|
| MCP architecture design | 🔵 Claude Code |
| MCP implementation | 🟢 Codex |
| Skill quality review | 🔵 Claude Code |
| Doc writing | 🔵 Claude Code |
| Artifact development | 🟢 Codex |
| Webapp test scripts | 🟢 Codex |

---

## Skill 1 — /mcp-builder

4-phase workflow: Research → Implement → Evaluate → Register.

**Stack:** TypeScript (recommended) + Streamable HTTP / stdio
**Python alt:** FastMCP

**Key decisions:**
- Tool naming: `service_action_noun` prefix pattern
- readOnlyHint / destructiveHint annotations
- Pagination for list tools
- Actionable error messages

**Register:**
```bash
claude mcp add my-server -- node build/index.js
```

---

## Skill 2 — /skill-creator

5-phase meta-skill: Define → Structure → Write Description → Evaluate → Iterate.

**Eval metrics:** Trigger Accuracy, Output Quality, Completeness, Efficiency (0-10 each)
**Target:** score ≥ 9 before kit-push
**Progressive Disclosure:** metadata (100t) → instructions (<5000t) → references (on demand)

**Checklist לפני push:**
```
□ name unique | description עם triggers | < 5000 tokens
□ /skill-security-auditor PASS | 3+ test cases עברו
```

---

## Skill 3 — /doc-coauthoring

3-stage workflow לכל סוג תיעוד.

**Stage 1:** Document Brief — audience, goal, tone, constraints
**Stage 2:** Structured content — templates לפי סוג (Spec/ADR/Runbook/Proposal)
**Stage 3:** Reader Test — fresh reader simulation, clarity check

**Formats:** Technical Spec, ADR, Runbook, Proposal, PRD, Incident PIR

---

## Skill 4 — /web-artifacts-builder

React 18 + TypeScript + Vite + shadcn/ui (40+ components) → bundle.html יחיד.

```bash
bash scripts/init-artifact.sh my-project
# develop...
bash scripts/bundle-artifact.sh  # → bundle.html
```

**Design:** avoid centered layouts, purple gradients, uniform corners
**RTL:** `<html dir="rtl">` + `text-right` classes

---

## Skill 5 — /webapp-testing

Playwright Python עם server lifecycle management.

**Pattern:** Reconnaissance → Identify Selectors → Execute Actions
**Critical:** `page.wait_for_load_state('networkidle')` לSPAs

```python
python scripts/with_server.py --server "npm run dev" --port 3000 \
  -- python your_test.py
```

---

## Quick Decision Tree

```
חיבור API חיצוני ל-Claude?
  └─ /mcp-builder

צריך skill חדש / לשפר skill?
  └─ /skill-creator (+ /skill-security-auditor אם ממקור חיצוני)

כותב מסמך, spec, proposal?
  └─ /doc-coauthoring

Dashboard / wizard אינטראקטיבי לשיתוף?
  └─ /web-artifacts-builder

בודק webapp מקומי עם Playwright?
  └─ /webapp-testing (משלים /qa)
```

---

## Related Skills (DevOPS Kit)

| Skill | קשר |
|-------|-----|
| `/engineering-pro` | `/skill-security-auditor` ← לפני install |
| `/qa` | `/webapp-testing` ← server lifecycle extension |
| `/spec-driven` | `/doc-coauthoring` ← spec writing stage 2 |
| `/self-improving` | `/skill-creator` ← pattern extraction |
| `/prd` | `/doc-coauthoring` ← PRD format |
