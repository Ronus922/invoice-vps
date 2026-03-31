---
name: doc-coauthoring
description: Structured 3-stage workflow for co-authoring documentation, proposals, technical specs, decision docs, and PRDs. Stage 1 gathers context, Stage 2 refines structure and content, Stage 3 tests with a reader agent. Use when writing docs, proposals, specs, or any structured content that needs quality and clarity. Triggers: "write documentation", "co-author doc", "write proposal", "technical spec", "decision doc", "write PRD", "draft spec".
---

# Doc Co-Authoring

> 3 שלבים לכתיבת תיעוד מקצועי: Context → Refine → Reader Test.

---

## מתי להשתמש

- כתיבת Technical Specs / PRDs / RFCs
- הצעות ל-stakeholders
- Runbooks ו-playbooks
- Decision docs (Architecture Decision Records)
- תיעוד API / onboarding
- כל מסמך שחייב להיות ברור לקורא שלא היה בשיחה

---

## 3-Stage Workflow

---

### Stage 1: Context Gathering

**מטרה:** להוציא את כל הידע הנדרש לפני שמתחילים לכתוב.

**שאלות לשאול:**
```
□ מה מטרת המסמך? (inform / persuade / instruct / decide)
□ מי הקורא? (developer / PM / executive / customer)
□ מה הקורא כבר יודע?
□ מה הפעולה שהקורא צריך לנקוט אחרי הקריאה?
□ יש constraints? (אורך, פורמט, branding)
□ יש קוד / data / screenshots לכלול?
□ מה הטון? (formal / technical / conversational)
```

**Output Stage 1:** Document Brief
```markdown
## Document Brief
- **Type:** {spec / proposal / runbook / ADR}
- **Audience:** {who}
- **Goal:** {what reader should do/know after reading}
- **Tone:** {formal / technical / friendly}
- **Length target:** {short / medium / long}
- **Key sections needed:** {list}
```

---

### Stage 2: Refinement & Structure

**מבנה מסמכים לפי סוג:**

**Technical Spec:**
```markdown
# {Feature/System Name} — Spec v{N}
## Summary (TL;DR — 3 bullets)
## Context & Problem Statement
## Goals & Non-Goals
## Design / Architecture
## Implementation Plan
## Testing Strategy
## Risks & Mitigations
## Open Questions
```

**Decision Doc (ADR):**
```markdown
# ADR-{N}: {Decision Title}
## Status: Proposed | Accepted | Superseded
## Context
## Decision
## Consequences (positive + negative)
## Alternatives Considered
```

**Runbook:**
```markdown
# {Service Name} — Runbook
## Overview
## Prerequisites
## Common Operations
## Troubleshooting (symptoms → diagnosis → fix)
## Escalation Path
## Related Runbooks
```

**Proposal:**
```markdown
# {Proposal Title}
## Executive Summary
## Problem
## Proposed Solution
## Impact / ROI
## Implementation Timeline
## Risks
## Ask (what you need from reader)
```

**Refinement Checklist:**
```
□ TL;DR / Summary בהתחלה (לקורא עסוק)
□ כל section עונה על שאלה אחת ברורה
□ אין jargon בלי הסבר
□ Active voice > passive voice
□ Numbers > vague descriptions ("50% faster" > "much faster")
□ אין orphan bullets (כל bullet point ב-context)
□ Code blocks עם syntax highlighting
□ Links לresources נוספים
```

---

### Stage 3: Reader Testing

**מטרה:** בדיקה שהמסמך עובד לקורא שלא היה בתהליך הכתיבה.

**Reader Test Process:**
```
1. הצג למשתמש: "נריץ Reader Test — אנסה לקרוא את המסמך כאחד שלא מכיר את הנושא"
2. קרא מחדש כ-"fresh reader"
3. לאחר כל section — שאל: "האם הצלחתי להבין? מה לא ברור?"
4. סמן:
   - ❓ = לא ברור, צריך הסבר
   - 📎 = צריך reference/link
   - ✂️ = יותר מדי detail, קצץ
   - ➕ = חסר מידע חשוב
5. תקן לפי הממצאים
```

**Reader Test Prompt (לsub-agent):**
```
You are a reader who has NOT been involved in writing this document.
Read it fresh and identify:
1. What's unclear or ambiguous?
2. What context is missing?
3. What would you do after reading this? (test if call-to-action is clear)
4. Any factual gaps?
Rate clarity: 1-10
```

---

## Integrations

### עם `/spec-driven`
- Stage 1 → Requirements gathering
- Stage 2 → Spec sections (FR-N, AC Given/When/Then)
- Stage 3 → Stakeholder review simulation

### עם `/prd`
- Stage 1 → PRD context
- Stage 2 → PRD structure (user stories, acceptance criteria)
- Stage 3 → PM / dev reader test

### עם `/incident-commander`
- Stage 2 → PIR format
- Stage 3 → Engineering / executive reader test

---

## Quality Standards

| מאפיין | בסיסי | מקצועי |
|--------|--------|---------|
| TL;DR | אין | ✅ תמיד |
| Numbers | vague | ✅ specific metrics |
| Voice | passive | ✅ active |
| Code | inline text | ✅ code blocks |
| Reader test | דילוג | ✅ stage 3 |
| Call-to-action | מרומז | ✅ מפורש |

---

## Anti-Patterns

- **Context dump** — לכתוב הכל בלי מבנה → תמיד stage 1 קודם
- **לדלג על stage 3** — "הכל ברור לי" ≠ ברור לקורא
- **Burying the lede** — המסקנה בסוף → Summary ראשון תמיד
- **"We" ambiguity** — מי "we"? → ספציפי: "Team A" / "אנחנו ב-DevOPS"
- **Unnumbered lists** — 5+ bullets → המר לnumbered list עם headers
