---
name: architecture
description: Chat Style Architecture - VSCode Claude Code panel CSS layout and flow for applying custom RTL styling on Linux/Windows.
---

# Chat Style Architecture

## Flow

```
~/.vscode/claude-rtl.css  (מקור - כאן עורכים)
        │
        ▼
~/.vscode/apply-claude-rtl.sh          (Linux: סקריפט Bash)
%USERPROFILE%\.vscode\apply-claude-rtl.ps1  (Windows: סקריפט PowerShell)
        │
        ▼
~/.vscode/extensions/anthropic.claude-code-*/webview/index.css  (מה ש-VSCode טוען)
        │
        ▼
~/.config/systemd/user/claude-rtl.timer         (Linux: הפעלה אוטומטית)
Task Scheduler: "Claude RTL CSS"                (Windows: הפעלה אוטומטית)
```

## CSS Structure in claude-rtl.css

### Section 1: RTL Support
- Message content → RTL
- Code blocks → LTR (always)
- File paths, tools → LTR (always)
- UI elements → LTR (always)

### Section 2: Typography & Readability
- Font: SF Pro Text (Apple system) + Hebrew fallbacks
- Antialiasing + optimizeLegibility
- Line height: 1.8 for body, 1.3-1.4 for headings
- Word/letter spacing tuned for Hebrew
- Bold: 700 weight for clarity

### Section 3: Spacing
- Messages: 14px padding top/bottom
- Paragraphs: 0.7em margin bottom
- Headings: graduated margins (h1 > h2 > h3)
- Lists: 0.35em between items
- Tables: auto width, RTL, right-aligned
- Code blocks: 14px 18px padding, 8px radius

### Section 4: Tool/Command Blocks
- Container: 6px margins, 10px 14px padding, 6px radius
- Font size: 0.88em (smaller than body)
- Compact spacing between tool blocks
- Progress dots: minimal margins

## Extension Update Behavior

When Claude Code extension updates:
1. New version folder created: `anthropic.claude-code-X.Y.Z-linux-x64` / `win32-x64`
2. Old folder removed
3. Timer/Task detects (runs hourly) and applies CSS to new version
4. User needs to Reload Window to see changes

## Security Constraints

The CSS file MUST NOT contain:
- `<script>` tags
- `javascript:` URLs
- `url()` references
- `@import` statements
- `fetch()` calls
- `expression()` (IE)
- `data:` URIs
- `-moz-binding`

The apply script validates against all of these before applying.
