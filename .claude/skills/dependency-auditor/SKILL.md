---
name: dependency-auditor
description: Multi-language dependency audit — CVE scanning, license compliance, outdated packages, supply chain security, upgrade path planning. Supports JS/TS, Python, Go, Rust, Ruby, Java, PHP, C#. Triggers: "audit dependencies", "check CVE", "license compliance", "outdated packages", "supply chain", "npm audit", "pip check", "dependency security".
---

# Dependency Auditor

ביקורת dependencies מקיפה — CVE, licenses, supply chain, upgrade paths.
תומך ב-8 ecosystems: JavaScript, Python, Go, Rust, Ruby, Java/Maven, PHP, C#/.NET

---

## Quick Audit Commands

```bash
# JavaScript / TypeScript
npm audit --json
npx audit-ci --critical

# Python
pip-audit --format=json
safety check --json

# Go
govulncheck ./...

# בדיקת licenses
npx license-checker --production --json
pip-licenses --format=json
```

---

## 7 מימדי ביקורת

### 1. CVE Scanning
```
□ 500+ CVE patterns, CVSS scores
□ Transitive dependencies (לא רק direct)
□ Severity: Critical (9-10) / High (7-8.9) / Medium (4-7) / Low (0-3.9)
□ Fix available? → upgrade path
□ Fix not available? → workaround / isolation
```

### 2. License Compliance

| קטגוריה | Licenses | SaaS OK? |
|---------|---------|----------|
| **Permissive** | MIT, Apache 2.0, BSD | ✅ |
| **Weak Copyleft** | LGPL, MPL | ✅ (עם אזהרות) |
| **Strong Copyleft** | GPL, AGPL | ⚠️ Copyleft infection risk |
| **Proprietary** | — | ❌ בלי רשיון |

```
GPL Contamination Rule: Package עם GPL license בproduction SaaS
→ יכול לחייב disclosure של source code שלך
→ Check: npx license-checker --failOn GPL --failOn AGPL
```

### 3. Outdated Packages
| סוג עדכון | פעולה | urgency |
|-----------|-------|---------|
| Security patch (1.0.0 → 1.0.1) | עדכן מיד | Critical |
| Bug fix (1.0.x → 1.1.0) | עדכן בשבוע | High |
| Feature (1.x → 2.0) | תכנן בsprint | Medium |
| Major rewrite (1.x → 2.0) | תכנן ברבעון | Low |

### 4. Supply Chain Security

**סימני אזהרה:**
```
□ Package שנוצר לאחרונה (<30 days) + downloads גבוהים
□ שם דומה ל-popular package (typosquatting):
   reqeusts, lodahs, expres, diango
□ Maintainer חדש שקיבל ownership לאחרונה
□ pip install / npm install בתוך קוד runtime
□ Unsigned packages (no checksums)
□ Dependencies ללא lockfile (non-deterministic builds)
```

### 5. Lockfile Integrity
```bash
# חייב להיות committed:
package-lock.json / yarn.lock / pnpm-lock.yaml
requirements.txt / Pipfile.lock / poetry.lock
go.sum
Cargo.lock

# בדיקה: lockfile מסונכרן עם manifest?
npm ci  # fails if package-lock.json out of sync
```

### 6. Upgrade Path Planning

```
Priority: Security > Bug fixes > Features > Major

לפני major upgrade:
□ Read CHANGELOG — breaking changes?
□ Test in isolated branch
□ npm outdated / pip list --outdated
□ Check migration guides
□ Rollback plan מוכן
```

### 7. Dependency Bloat
```bash
# מצא unused dependencies
npx depcheck
pip-extra-reqs .

# Bundle size impact (JS)
npx bundlephobia-cli package-name

# הסר unused:
npm uninstall <package>
pip uninstall <package>
```

---

## Audit Report Format

```markdown
## Dependency Audit — {date}

### Summary
- Total dependencies: {N} direct, {M} transitive
- Critical CVEs: {count}
- High CVEs: {count}
- License issues: {count}
- Outdated (major): {count}

### Critical Findings
| Package | Version | CVE | CVSS | Fix |
|---------|---------|-----|------|-----|
| lodash | 4.17.15 | CVE-2021-23337 | 7.2 | upgrade to 4.17.21 |

### License Issues
| Package | License | Issue |
|---------|---------|-------|
| some-pkg | GPL-3.0 | Copyleft in SaaS |

### Upgrade Plan
Week 1: Security patches (Critical + High CVEs)
Week 2: Bug fix updates
Month 2: Major version upgrades (planned)
```

---

## Scanning Frequency

| סוג | תדירות |
|-----|--------|
| Security CVE scan | יומי / בכל commit |
| License audit | שבועי |
| Upgrade planning | חודשי |
| Full audit | רבעוני |

---

## CI/CD Integration

```yaml
# GitHub Actions
- name: Security Audit
  run: |
    npm audit --audit-level=high
    npx license-checker --failOn "GPL-3.0;AGPL-3.0"
```

---

## Ecosystem-Specific Commands

| Ecosystem | Scan | Licenses | Outdated |
|-----------|------|---------|----------|
| npm | `npm audit` | `npx license-checker` | `npm outdated` |
| Python | `pip-audit` | `pip-licenses` | `pip list --outdated` |
| Go | `govulncheck ./...` | `go-licenses` | `go list -u -m all` |
| Rust | `cargo audit` | `cargo-license` | `cargo outdated` |
| Ruby | `bundle audit` | `license_finder` | `bundle outdated` |
