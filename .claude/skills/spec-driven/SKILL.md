---
name: spec-driven
description: Spec-first development workflow — no code without approved spec. Mandatory 9-section spec format with RFC 2119 requirements, Given/When/Then acceptance criteria, TDD integration. Use when starting a new feature, API, or major change. Triggers: "write spec first", "define acceptance criteria", "spec before code", "feature requirements", "FR-", "Given/When/Then", "spec-driven".
---

# Spec-Driven Workflow

## Iron Law

```
NO CODE WITHOUT AN APPROVED SPEC.
NO EXCEPTIONS. NO "QUICK PROTOTYPES." NO "I'LL DOCUMENT IT LATER."
```

---

## 9 Mandatory Spec Sections

| # | Section | כללים עיקריים |
|---|---------|--------------|
| 1 | **Title & Metadata** | Author, date, status (Draft/Review/Approved), reviewers |
| 2 | **Context** | למה הfeature קיים — 2-4 פסקאות עם evidence |
| 3 | **Functional Requirements** | RFC 2119 (MUST/SHOULD/MAY), numbered FR-N, atomic & testable |
| 4 | **Non-Functional Requirements** | Performance, security, accessibility — thresholds measurable |
| 5 | **Acceptance Criteria** | Given/When/Then. כל AC מפנה ל-FR-* או NFR-* |
| 6 | **Edge Cases** | Numbered EC-N. Failure modes לכל external dependency |
| 7 | **API Contracts** | TypeScript interfaces, success + error responses |
| 8 | **Data Models** | Field/type/constraints table. כל entity = model |
| 9 | **Out of Scope** | Exclusions מפורשות עם סיבות |

---

## Spec Template

```markdown
# {Feature Name} — Spec v{N}

## Metadata
- **Author:** {name}
- **Date:** {YYYY-MM-DD}
- **Status:** Draft | Review | Approved
- **Reviewers:** {names}

## Context
{Why this feature exists. 2-4 paragraphs with evidence/data.}

## Functional Requirements
- FR-1: The system MUST {requirement}
- FR-2: The system SHOULD {requirement}
- FR-3: The system MAY {requirement}

## Non-Functional Requirements
- NFR-1: Response time MUST be < 200ms for 95th percentile
- NFR-2: Feature MUST be accessible (WCAG 2.2 AA)

## Acceptance Criteria
### AC-1 (FR-1)
- **Given** {initial state}
- **When** {action}
- **Then** {expected outcome}

## Edge Cases
- EC-1: {edge case description} → {expected behavior}
- EC-2: External API unavailable → {fallback behavior}

## API Contracts
\`\`\`typescript
interface CreateRequest {
  field: string; // required, max 100 chars
}
interface CreateResponse {
  id: string;
  createdAt: Date;
}
interface ErrorResponse {
  code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'SERVER_ERROR';
  message: string;
}
\`\`\`

## Data Models
| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | Required, immutable |
| name | string | Required, max 100 |
| createdAt | DateTime | Auto-set, immutable |

## Out of Scope
- {Feature X} — נדחה ל-v2 כי {reason}
- {Feature Y} — handled by {other system}
```

---

## 6-Phase Workflow

### Phase 1: Gather Requirements
```
□ קרא קוד קיים רלוונטי
□ זהה constraints (performance, security, backwards compatibility)
□ רשום unknowns מפורשות
□ Interview stakeholders אם צריך
```

### Phase 2: Write Spec
```
□ מלא את כל 9 הsections
□ כל FR חייב להיות atomic ו-testable
□ כל AC חייב Given/When/Then
□ כל external dependency → edge case
```

### Phase 3: Validate Spec
```
□ כל FR ממוספר FR-N?
□ כל AC מפנה ל-FR-* או NFR-*?
□ יש edge case לכל external dependency?
□ Out of scope מפורש?
□ Score: 80+ → proceed to Phase 4
```

### Phase 4: Generate Tests
```
□ כל AC → failing test stub
□ כל EC → test case
□ Run: all tests RED before coding
```

### Phase 5: Implement
```
□ AC אחד בכל פעם
□ Minimal code לpass
□ Full test suite אחרי כל commit
□ אסור scope creep
```

### Phase 6: Self-Review
```
□ כל AC → passing test?
□ אין קוד מחוץ לscope?
□ NFRs verified (performance, a11y)?
□ Spec updated אם הוחלט לשנות?
```

---

## STOP & Ask (vs Continue Autonomously)

**עצור ושאל כשיש:**
- Scope creep מזוהה
- Ambiguity > 30% בdomain
- Breaking changes נדרשים
- Security implications
- Cross-team dependencies

**המשך אוטומטית כשיש:**
- Spec ברורה ו-approved
- כל ACs עם passing tests
- שינויים non-breaking
- Implementation = direct translation של AC

---

## 7 Anti-Patterns

1. Coding לפני אישור spec
2. AC לא testable: "יהיה מהיר" → כתוב: "< 200ms p95"
3. Edge cases חסרים לerror paths
4. Spec כpost-hoc documentation
5. Gold-plating מחוץ לscope
6. AC ללא traceability ל-FR-*
7. דילוג על spec validation

---

## TDD Integration

```
Phase 4: Generate Tests  ─→  RED (tests exist, fail)
Phase 5: Implement       ─→  GREEN (minimal code to pass)
Phase 6: Self-Review     ─→  REFACTOR (clean internals)
```

---

## RFC 2119 Quick Reference

| מילה | משמעות |
|------|--------|
| MUST / SHALL | חובה מוחלטת |
| MUST NOT / SHALL NOT | אסור מוחלט |
| SHOULD | מומלץ מאוד, יש סיבות ייחודיות לחרוג |
| SHOULD NOT | לא מומלץ, יש סיבות ייחודיות לכלול |
| MAY | אופציונלי |
