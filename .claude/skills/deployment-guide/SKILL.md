---
name: deployment-guide
description: Claude Code Chat Style Deployment Guide - מדריך התקנה להטמעת עיצוב CSS מותאם לפנל Claude Code ב-VSCode על Linux/Windows.
---

# Claude Code Chat Style - Deployment Guide

> מדריך התקנה להטמעת עיצוב CSS מותאם לפנל Claude Code ב-VSCode על מחשב/שרת חדש.
> תומך: **Linux** + **Windows**

---

## סקירה כללית

המערכת מוסיפה עיצוב מותאם לפנל Claude Code ב-VSCode:
- **RTL** - תמיכה בעברית (הודעות מימין לשמאל, קוד נשאר LTR)
- **טיפוגרפיה** - פונט מותאם, line-height, spacing לקריאות מירבית
- **עיצוב** - טבלאות, code blocks, tool blocks, blockquotes
- **צבעים** - שימוש ב-VSCode theme variables (עובד עם כל ערכת נושא)

### ארכיטקטורה

```
Linux:
~/.vscode/claude-rtl.css                        ← קובץ CSS (מקור)
~/.vscode/apply-claude-rtl.sh                   ← סקריפט Bash
~/.vscode/extensions/anthropic.claude-code-*/webview/index.css  ← יעד
~/.config/systemd/user/claude-rtl.timer         ← הפעלה אוטומטית

Windows:
%USERPROFILE%\.vscode\claude-rtl.css            ← קובץ CSS (מקור)
%USERPROFILE%\.vscode\apply-claude-rtl.ps1      ← סקריפט PowerShell
%USERPROFILE%\.vscode\extensions\anthropic.claude-code-*\webview\index.css  ← יעד
Task Scheduler: "Claude RTL CSS"                ← הפעלה אוטומטית
```

---

## שלב 1: יצירת קובץ ה-CSS

### Linux: `~/.vscode/claude-rtl.css`
### Windows: `%USERPROFILE%\.vscode\claude-rtl.css`

```css
/* === RTL Support for Hebrew === */

/* ONLY message content area - not headers, menus, history, or UI */
[class*="message_"] p,
[class*="message_"] li,
[class*="message_"] h1,
[class*="message_"] h2,
[class*="message_"] h3,
[class*="message_"] h4,
[class*="message_"] td,
[class*="message_"] th,
[class*="message_"] blockquote,
[class*="message_"] > div {
  direction: rtl !important;
  text-align: right !important;
}

/* Lists inside messages */
[class*="message_"] ul,
[class*="message_"] ol {
  direction: rtl !important;
  padding-right: 1.5em !important;
  padding-left: 0 !important;
}

/* Keep ALL code LTR */
pre, code, [class*="codeBlock"], [class*="code-block"],
[class*="CodeBlock"], [class*="bashCommand"] {
  direction: ltr !important;
  text-align: left !important;
}

/* Keep file paths, tools, and technical content LTR */
[class*="filePath"], [class*="file-path"],
[class*="tool"], [class*="Tool"],
[class*="changedFile"], [class*="fileList"] {
  direction: ltr !important;
  text-align: left !important;
}

/* Keep ALL UI elements LTR - headers, menus, popups, sessions, navigation */
[class*="header_"], [class*="Header"],
[class*="menu"], [class*="Menu"],
[class*="popup"], [class*="Popup"],
[class*="modal"], [class*="Modal"],
[class*="session"], [class*="Session"],
[class*="nav"], [class*="Nav"],
[class*="button"], [class*="Button"],
[class*="input"], [class*="Input"],
[class*="dropdown"], [class*="list_"],
[class*="sidebar"], [class*="panel_"] {
  direction: ltr !important;
  text-align: left !important;
}

/* === Typography & Readability === */

/* Better font for Hebrew */
/* Linux: Noto Sans Hebrew | Windows: Segoe UI */
[class*="message_"] {
  font-family: "Noto Sans Hebrew", "DejaVu Sans", "Liberation Sans", "Segoe UI", "Arial Hebrew", Arial, sans-serif !important;
  font-weight: 400 !important;
  -webkit-font-smoothing: antialiased !important;
  -moz-osx-font-smoothing: grayscale !important;
  text-rendering: optimizeLegibility !important;
}

/* Line height and spacing for clear Hebrew reading */
[class*="message_"] p,
[class*="message_"] li,
[class*="message_"] > div {
  line-height: 1.8 !important;
  word-spacing: 0.04em !important;
  letter-spacing: 0.01em !important;
}

/* Generous spacing between paragraphs */
[class*="message_"] p {
  margin-bottom: 0.9em !important;
}

/* Better spacing before/after tables and code blocks */
[class*="message_"] p + table,
[class*="message_"] p + pre {
  margin-top: 1em !important;
}
[class*="message_"] table + p,
[class*="message_"] pre + p {
  margin-top: 1em !important;
}

/* Lists after paragraphs - breathing room */
[class*="message_"] p + ul,
[class*="message_"] p + ol {
  margin-top: 0.5em !important;
}

/* Spacing between messages */
[class*="message_"] {
  padding-top: 14px !important;
  padding-bottom: 14px !important;
}

/* Headings - prominent section markers */
[class*="message_"] h1 {
  margin-top: 1.3em !important;
  margin-bottom: 0.7em !important;
  line-height: 1.3 !important;
  font-weight: 700 !important;
  font-size: 1.3em !important;
  padding-bottom: 0.3em !important;
  border-bottom: 1px solid rgba(217, 119, 87, 0.3) !important;
}

[class*="message_"] h2 {
  margin-top: 1.2em !important;
  margin-bottom: 0.6em !important;
  line-height: 1.35 !important;
  font-weight: 650 !important;
  font-size: 1.15em !important;
  color: var(--app-claude-orange, #d97757) !important;
}

[class*="message_"] h3,
[class*="message_"] h4 {
  margin-top: 1.1em !important;
  margin-bottom: 0.5em !important;
  line-height: 1.4 !important;
  font-weight: 600 !important;
  font-size: 1.05em !important;
}

/* List items - generous spacing for easy scanning */
[class*="message_"] li {
  margin-bottom: 0.5em !important;
}

/* Nested lists spacing */
[class*="message_"] li ul,
[class*="message_"] li ol {
  margin-top: 0.3em !important;
}

/* Better table readability (theme-aware) */
[class*="message_"] table {
  border-collapse: collapse !important;
  margin: 1em 0 1em auto !important;
  width: auto !important;
  direction: rtl !important;
  border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2)) !important;
  border-radius: 6px !important;
  overflow: hidden !important;
}

[class*="message_"] td,
[class*="message_"] th {
  padding: 9px 16px !important;
  line-height: 1.6 !important;
  white-space: nowrap !important;
  border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.15)) !important;
}

[class*="message_"] th {
  font-weight: 600 !important;
  background: var(--vscode-editor-lineHighlightBackground, rgba(128, 128, 128, 0.1)) !important;
  color: var(--vscode-editor-foreground, var(--vscode-foreground)) !important;
  font-size: 0.95em !important;
  letter-spacing: 0.02em !important;
  padding: 10px 16px !important;
}

/* Zebra striping for table rows */
[class*="message_"] tr:nth-child(even) td {
  background: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.05)) !important;
}

/* Hover highlight on table rows */
[class*="message_"] tr:hover td {
  background: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.08)) !important;
}

/* First column emphasis (usually labels/keys) */
[class*="message_"] td:first-child {
  font-weight: 500 !important;
  color: var(--vscode-editor-foreground, var(--vscode-foreground)) !important;
}

/* Technical values in table cells - code-like content */
[class*="message_"] td code {
  font-size: 0.9em !important;
  padding: 2px 6px !important;
  color: var(--vscode-textPreformat-foreground, #d97757) !important;
}

/* Code blocks - primary technical content */
[class*="message_"] pre {
  margin: 0.8em 0 !important;
  padding: 14px 18px !important;
  border-radius: 8px !important;
  line-height: 1.6 !important;
  border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.15)) !important;
}

/* Monospace font size in code blocks */
[class*="message_"] pre code {
  font-size: 0.95em !important;
  color: var(--vscode-editor-foreground, inherit) !important;
  background: transparent !important;
  padding: 0 !important;
}

/* Inline code - prominent for technical terms, paths, commands */
[class*="message_"] code {
  padding: 3px 8px !important;
  border-radius: 4px !important;
  font-size: 0.93em !important;
}

/* Blockquote - prominent for summaries and notes */
[class*="message_"] blockquote {
  padding: 12px 20px !important;
  margin: 1em 0 !important;
  border-right: 3px solid var(--app-claude-orange, #d97757) !important;
  border-left: none !important;
  background: var(--vscode-textBlockQuote-background, rgba(128, 128, 128, 0.06)) !important;
  border-radius: 4px !important;
}

/* Bold text - very prominent for key information */
[class*="message_"] strong,
[class*="message_"] b {
  font-weight: 700 !important;
  letter-spacing: 0.02em !important;
}

/* Horizontal rule as section separator */
[class*="message_"] hr {
  margin: 1.2em 0 !important;
  opacity: 0.4 !important;
}

/* Visual distinction for user messages */
[class*="userMessage_"] {
  border-right: 3px solid var(--app-claude-orange, #d97757) !important;
  padding-right: 14px !important;
  background: rgba(217, 119, 87, 0.04) !important;
  border-radius: 6px !important;
}

/* Subtle separator between messages */
[class*="message_"] + [class*="message_"] {
  border-top: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.12)) !important;
}

/* Secondary/description text */
[class*="description_"],
[class*="timestamp_"],
[class*="secondary_"] {
  color: var(--vscode-descriptionForeground) !important;
  opacity: 1 !important;
}

/* === Contrast & Color Improvements (theme-aware) === */

/* Message body text - uses VS Code theme foreground */
[class*="message_"] p,
[class*="message_"] li,
[class*="message_"] > div,
[class*="message_"] td,
[class*="message_"] th,
[class*="message_"] blockquote {
  color: var(--vscode-foreground, inherit) !important;
  opacity: 1 !important;
}

/* Headings - stronger foreground */
[class*="message_"] h1,
[class*="message_"] h2,
[class*="message_"] h3,
[class*="message_"] h4 {
  color: var(--vscode-editor-foreground, var(--vscode-foreground)) !important;
  opacity: 1 !important;
}

/* Bold text - editor foreground for emphasis */
[class*="message_"] strong,
[class*="message_"] b {
  color: var(--vscode-editor-foreground, var(--vscode-foreground)) !important;
}

/* Links - uses VS Code link color */
[class*="message_"] a {
  color: var(--vscode-textLink-foreground, #6cb6ff) !important;
  opacity: 1 !important;
}

/* Inline code - uses VS Code textPreformat color */
[class*="message_"] code {
  color: var(--vscode-textPreformat-foreground, #d97757) !important;
  background: var(--vscode-textPreformat-background, rgba(128, 128, 128, 0.12)) !important;
}

/* Tool block headers */
[class*="title_ULYGFA"],
[class*="header_ULYGFA"] {
  color: var(--vscode-foreground) !important;
}

/* Tool output text */
[class*="output_ULYGFA"] {
  color: var(--vscode-foreground) !important;
  opacity: 1 !important;
}

/* IN/OUT labels */
[class*="output_ULYGFA"]::before {
  opacity: 0.8 !important;
}

/* Bash command text */
[class*="bashCommand_"] {
  color: var(--vscode-foreground) !important;
}

/* Meta messages (system info, interrupted, etc.) */
[class*="metaMessage_"] {
  opacity: 0.9 !important;
  color: var(--vscode-descriptionForeground) !important;
}

/* Model indicator (bottom bar) */
[class*="modelIndicator_"] {
  opacity: 0.85 !important;
}

/* Input footer (permission mode, etc.) */
[class*="inputFooter_"] {
  color: var(--vscode-descriptionForeground) !important;
}

/* Message input - better readability when typing */
[class*="messageInput_"] {
  font-family: "Noto Sans Hebrew", "DejaVu Sans", "Liberation Sans", "Segoe UI", "Arial Hebrew", Arial, sans-serif !important;
  direction: rtl !important;
  text-align: right !important;
  line-height: 1.6 !important;
}

/* Text selection - more visible highlight */
[class*="message_"] ::selection {
  background: var(--vscode-editor-selectionBackground, rgba(108, 182, 255, 0.3)) !important;
}

/* Full width for technical content - no line width restriction */

/* List markers */
[class*="message_"] ul {
  list-style-type: disc !important;
}
[class*="message_"] li::marker {
  color: var(--vscode-foreground) !important;
  opacity: 0.7 !important;
}

/* Empty state text */
[class*="emptyStateText_"] {
  font-size: 11px !important;
  color: var(--vscode-descriptionForeground) !important;
}

/* === Tool/Command Blocks Styling === */

/* Tool output container - visually separated from explanation text */
[class*="container_ULYGFA"] {
  margin-top: 10px !important;
  margin-bottom: 10px !important;
  padding: 10px 14px !important;
  border-radius: 6px !important;
  border-right: 2px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.15)) !important;
}

/* Tool header (e.g. "Bash  ...") */
[class*="header_ULYGFA"] {
  margin-bottom: 6px !important;
  font-size: 0.88em !important;
}

/* Tool title */
[class*="title_ULYGFA"] {
  font-weight: 600 !important;
  font-size: 0.9em !important;
}

/* Tool output (IN/OUT blocks) - main technical content */
[class*="output_ULYGFA"] {
  border-radius: 4px !important;
  margin-top: 6px !important;
  padding: 10px 14px !important;
  font-size: 0.9em !important;
  line-height: 1.5 !important;
}

/* Bash command text - bigger for readability */
[class*="bashCommand_"] {
  font-size: 0.9em !important;
  line-height: 1.5 !important;
  padding: 4px 0 !important;
}

/* Tool use/result containers - remove excess spacing */
[class*="toolUse_"],
[class*="toolResult_"] {
  margin-top: 4px !important;
  margin-bottom: 4px !important;
}

/* Reduce gap between message text and tool blocks */
[class*="message_"] [class*="toolUse_"]:first-child {
  margin-top: 0 !important;
}

/* Progress dots - tighter */
[class*="dotProgress_"],
[class*="dotSuccess_"],
[class*="dotFailure_"],
[class*="dotWarning_"] {
  margin-top: 2px !important;
  margin-bottom: 2px !important;
}

/* Spinner row - compact */
[class*="spinnerRow_"] {
  padding: 4px 0 !important;
}

/* Git output blocks */
[class*="gitOutput_"] {
  border-radius: 4px !important;
  padding: 10px 14px !important;
  font-size: 0.9em !important;
  line-height: 1.5 !important;
  color: var(--vscode-foreground) !important;
}

/* Git labels (additions, deletions, file statuses) */
[class*="gitOutputLabel_"],
[class*="gitOutputText_"] {
  color: var(--vscode-foreground) !important;
}

/* Diff stats - clearer */
[class*="additions_"] {
  color: var(--vscode-gitDecoration-addedResourceForeground, #4ec974) !important;
}
[class*="deletions_"] {
  color: var(--vscode-gitDecoration-deletedResourceForeground, #f47067) !important;
}
```

---

## שלב 2: סקריפט החלה

### Linux - `~/.vscode/apply-claude-rtl.sh`

```bash
#!/bin/bash
# Apply RTL CSS to Claude Code extension webview
# Runs automatically via systemd user timer to persist RTL after extension updates
#
# Security:
# - Only appends pre-defined CSS rules to a specific extension file
# - No network access, no data collection, no external dependencies
# - Validates CSS content before applying (blocks scripts, URLs, imports)
# - Rejects symlinks to prevent path manipulation

set -euo pipefail

RTL_CSS="$HOME/.vscode/claude-rtl.css"
MARKER="/* === RTL Support for Hebrew === */"
EXTENSIONS_DIR="$HOME/.vscode/extensions"
LOG_FILE="$HOME/.vscode/claude-rtl.log"
MAX_LOG_LINES=100

# Validate RTL CSS file exists and is readable
if [ ! -f "$RTL_CSS" ] || [ ! -r "$RTL_CSS" ]; then
    exit 0
fi

# Security: reject if RTL CSS is a symlink
if [ -L "$RTL_CSS" ]; then
    echo "[$(date)] SECURITY: $RTL_CSS is a symlink. Aborting." >> "$LOG_FILE"
    exit 1
fi

# Validate RTL CSS contains only CSS (no script tags, no URLs, no imports)
if grep -qiE '<script|javascript:|url\(|@import|fetch\(|XMLHttpRequest|expression\(|data:|\\-moz\\-binding' "$RTL_CSS" 2>/dev/null; then
    echo "[$(date)] SECURITY: RTL CSS file contains suspicious content. Aborting." >> "$LOG_FILE"
    exit 1
fi

# Find ALL Claude Code extension directories
for CLAUDE_EXT in "$EXTENSIONS_DIR"/anthropic.claude-code-*; do
    [ -d "$CLAUDE_EXT" ] || continue

    WEBVIEW_CSS="$CLAUDE_EXT/webview/index.css"

    # Skip if webview CSS doesn't exist
    [ -f "$WEBVIEW_CSS" ] || continue

    # Security: reject if target is a symlink
    if [ -L "$WEBVIEW_CSS" ]; then
        echo "[$(date)] SECURITY: $WEBVIEW_CSS is a symlink. Skipping." >> "$LOG_FILE"
        continue
    fi

    # Skip if RTL already applied
    grep -qF "$MARKER" "$WEBVIEW_CSS" 2>/dev/null && continue

    # Verify target file looks like a CSS file
    if ! head -c 200 "$WEBVIEW_CSS" | grep -q "font-size\|display:\|color:" 2>/dev/null; then
        echo "[$(date)] SKIP: $WEBVIEW_CSS doesn't look like a CSS file" >> "$LOG_FILE"
        continue
    fi

    # Apply RTL CSS
    cat "$RTL_CSS" >> "$WEBVIEW_CSS"
    echo "[$(date)] Applied RTL CSS to $WEBVIEW_CSS" >> "$LOG_FILE"
done

# Rotate log file if too large
if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE")" -gt "$MAX_LOG_LINES" ]; then
    TMPFILE=$(mktemp "$LOG_FILE.XXXXXX")
    tail -n "$MAX_LOG_LINES" "$LOG_FILE" > "$TMPFILE" && mv "$TMPFILE" "$LOG_FILE"
fi
```

הגדר הרשאות:
```bash
chmod 700 ~/.vscode/apply-claude-rtl.sh
chmod 600 ~/.vscode/claude-rtl.css
```

### Windows - `%USERPROFILE%\.vscode\apply-claude-rtl.ps1`

```powershell
# Apply RTL CSS to Claude Code extension webview
# Runs automatically via Task Scheduler to persist RTL after extension updates
#
# Security:
# - Only appends pre-defined CSS rules to a specific extension file
# - No network access, no data collection, no external dependencies
# - Validates CSS content before applying (blocks scripts, URLs, imports)
# - Rejects symlinks to prevent path manipulation

$ErrorActionPreference = "Stop"

$RtlCss = Join-Path $env:USERPROFILE ".vscode\claude-rtl.css"
$Marker = "/* === RTL Support for Hebrew === */"
$ExtensionsDir = Join-Path $env:USERPROFILE ".vscode\extensions"
$LogFile = Join-Path $env:USERPROFILE ".vscode\claude-rtl.log"
$MaxLogLines = 100

function Write-Log($msg) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "[$timestamp] $msg"
}

# Validate RTL CSS file exists
if (-not (Test-Path $RtlCss -PathType Leaf)) { exit 0 }

# Security: reject if symlink
if ((Get-Item $RtlCss).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    Write-Log "SECURITY: $RtlCss is a symlink. Aborting."
    exit 1
}

# Validate CSS contains no suspicious content
$cssContent = Get-Content $RtlCss -Raw
$dangerousPatterns = '<script|javascript:|url\(|@import|fetch\(|XMLHttpRequest|expression\(|data:|-moz-binding'
if ($cssContent -match $dangerousPatterns) {
    Write-Log "SECURITY: RTL CSS file contains suspicious content. Aborting."
    exit 1
}

# Find ALL Claude Code extension directories
$claudeExtDirs = Get-ChildItem -Path $ExtensionsDir -Directory -Filter "anthropic.claude-code-*" -ErrorAction SilentlyContinue

foreach ($extDir in $claudeExtDirs) {
    $webviewCss = Join-Path $extDir.FullName "webview\index.css"

    # Skip if webview CSS doesn't exist
    if (-not (Test-Path $webviewCss -PathType Leaf)) { continue }

    # Security: reject if symlink
    if ((Get-Item $webviewCss).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        Write-Log "SECURITY: $webviewCss is a symlink. Skipping."
        continue
    }

    # Skip if RTL already applied
    $existingContent = Get-Content $webviewCss -Raw
    if ($existingContent -match [regex]::Escape($Marker)) { continue }

    # Verify target looks like a CSS file
    $head = $existingContent.Substring(0, [Math]::Min(200, $existingContent.Length))
    if ($head -notmatch "font-size|display:|color:") {
        Write-Log "SKIP: $webviewCss doesn't look like a CSS file"
        continue
    }

    # Apply RTL CSS
    Add-Content -Path $webviewCss -Value $cssContent
    Write-Log "Applied RTL CSS to $webviewCss"
}

# Rotate log file if too large
if (Test-Path $LogFile) {
    $lines = Get-Content $LogFile
    if ($lines.Count -gt $MaxLogLines) {
        $lines | Select-Object -Last $MaxLogLines | Set-Content $LogFile
    }
}
```

---

## שלב 3: הפעלה אוטומטית

### Linux (systemd user timer)

צור `~/.config/systemd/user/claude-rtl.service`:

```ini
[Unit]
Description=Apply RTL CSS to Claude Code extension

[Service]
Type=oneshot
ExecStart=/bin/bash %h/.vscode/apply-claude-rtl.sh
```

צור `~/.config/systemd/user/claude-rtl.timer`:

```ini
[Unit]
Description=Apply RTL CSS to Claude Code hourly

[Timer]
OnBootSec=30
OnUnitActiveSec=1h

[Install]
WantedBy=timers.target
```

הפעלה:
```bash
systemctl --user daemon-reload
systemctl --user enable --now claude-rtl.timer
```

### Windows (Task Scheduler)

הרץ ב-PowerShell כ-Administrator:

```powershell
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$env:USERPROFILE\.vscode\apply-claude-rtl.ps1`""

$triggers = @(
    # At logon
    $(New-ScheduledTaskTrigger -AtLogOn),
    # Every hour
    $(New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1))
)

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName "Claude RTL CSS" `
    -Action $action `
    -Trigger $triggers `
    -Settings $settings `
    -Description "Apply RTL CSS to Claude Code extension after updates"
```

---

## שלב 4: VSCode Settings

הוסף ל-`settings.json` של VSCode:

```json
{
  "chat.fontSize": 20
}
```

**מיקום הקובץ:**
- Linux: `~/.config/Code/User/settings.json`
- Windows: `%APPDATA%\Code\User\settings.json`

---

## שלב 5: החלה ראשונה

### Linux
```bash
~/.vscode/apply-claude-rtl.sh
```

### Windows (PowerShell)
```powershell
& "$env:USERPROFILE\.vscode\apply-claude-rtl.ps1"
```

ואז ב-VSCode:
- `Ctrl+Shift+P`
- הקלד: **Reload Window**
- Enter

---

## סקריפט התקנה מהירה

### Linux (One-liner)

```bash
# 1. Create directories
mkdir -p ~/.vscode ~/.config/systemd/user

# 2. Copy files (from source machine or repo)
# scp source:~/.vscode/claude-rtl.css ~/.vscode/
# scp source:~/.vscode/apply-claude-rtl.sh ~/.vscode/

# 3. Set permissions
chmod 700 ~/.vscode/apply-claude-rtl.sh
chmod 600 ~/.vscode/claude-rtl.css

# 4. Create systemd service
cat > ~/.config/systemd/user/claude-rtl.service << 'EOF'
[Unit]
Description=Apply RTL CSS to Claude Code extension

[Service]
Type=oneshot
ExecStart=/bin/bash %h/.vscode/apply-claude-rtl.sh
EOF

# 5. Create systemd timer
cat > ~/.config/systemd/user/claude-rtl.timer << 'EOF'
[Unit]
Description=Apply RTL CSS to Claude Code hourly

[Timer]
OnBootSec=30
OnUnitActiveSec=1h

[Install]
WantedBy=timers.target
EOF

# 6. Enable and start timer
systemctl --user daemon-reload
systemctl --user enable --now claude-rtl.timer

# 7. Apply now
~/.vscode/apply-claude-rtl.sh

# 8. Set chat font size
SETTINGS="$HOME/.config/Code/User/settings.json"
if [ -f "$SETTINGS" ] && command -v jq &>/dev/null; then
    jq '. + {"chat.fontSize": 20}' "$SETTINGS" > "${SETTINGS}.tmp" && mv "${SETTINGS}.tmp" "$SETTINGS"
fi

echo "Done! Reload VSCode window (Ctrl+Shift+P → Reload Window)"
```

### Windows (PowerShell)

```powershell
# 1. Ensure directory exists
New-Item -ItemType Directory -Path "$env:USERPROFILE\.vscode" -Force | Out-Null

# 2. Copy files (from source machine or repo)
# Copy-Item \\source\claude-rtl.css "$env:USERPROFILE\.vscode\"
# Copy-Item \\source\apply-claude-rtl.ps1 "$env:USERPROFILE\.vscode\"

# 3. Create scheduled task
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$env:USERPROFILE\.vscode\apply-claude-rtl.ps1`""

$triggers = @(
    $(New-ScheduledTaskTrigger -AtLogOn),
    $(New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1))
)

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName "Claude RTL CSS" `
    -Action $action `
    -Trigger $triggers `
    -Settings $settings `
    -Description "Apply RTL CSS to Claude Code extension after updates"

# 4. Apply now
& "$env:USERPROFILE\.vscode\apply-claude-rtl.ps1"

# 5. Set chat font size
$settingsPath = Join-Path $env:APPDATA "Code\User\settings.json"
if (Test-Path $settingsPath) {
    $json = Get-Content $settingsPath -Raw | ConvertFrom-Json
    $json | Add-Member -NotePropertyName "chat.fontSize" -NotePropertyValue 20 -Force
    $json | ConvertTo-Json -Depth 10 | Set-Content $settingsPath
}

Write-Host "Done! Reload VSCode window (Ctrl+Shift+P → Reload Window)"
```

---

## התאמות לפי פלטפורמה

### הבדלי פונט

| פלטפורמה | font-family מומלץ |
|----------|-------------------|
| **Linux** | `"Noto Sans Hebrew", "DejaVu Sans", "Liberation Sans", Arial, sans-serif` |
| **Windows** | `"Segoe UI", "Arial Hebrew", Arial, sans-serif` |

> בקובץ ה-CSS, שנה את ה-`font-family` בשני המקומות: `[class*="message_"]` ו-`[class*="messageInput_"]`

### הבדלי font-weight

- **Linux**: `font-weight: 400` (רוב הפונטים תומכים רק ב-400/700)
- **Windows**: `font-weight: 400` (Segoe UI תומך ב-400/600/700)

### LTR בלבד (ללא RTL)

אם לא צריך עברית, מחק את כל **Section 1: RTL Support** (שורות 1-55) מה-CSS ואת ה-`direction: rtl` מ-`messageInput_`.

---

## עדכון ה-Extension

כש-Claude Code מתעדכן:
1. נוצרת תיקייה חדשה: `anthropic.claude-code-X.Y.Z-linux-x64` / `win32-x64`
2. התיקייה הישנה נמחקת
3. הסקריפט מזהה (רץ כל שעה) ומחיל CSS על הגרסה החדשה
4. צריך **Reload Window** ב-VSCode כדי לראות

**להחלה מיידית** אחרי עדכון:

Linux:
```bash
~/.vscode/apply-claude-rtl.sh
```

Windows:
```powershell
& "$env:USERPROFILE\.vscode\apply-claude-rtl.ps1"
```

---

## פתרון בעיות

### CSS לא מוחל

**Linux:**
```bash
# בדוק שה-extension קיים
ls ~/.vscode/extensions/anthropic.claude-code-*

# בדוק שה-CSS הוחל
grep -c "RTL Support for Hebrew" ~/.vscode/extensions/anthropic.claude-code-*/webview/index.css

# בדוק לוג
cat ~/.vscode/claude-rtl.log
```

**Windows (PowerShell):**
```powershell
# בדוק שה-extension קיים
Get-ChildItem "$env:USERPROFILE\.vscode\extensions\anthropic.claude-code-*"

# בדוק שה-CSS הוחל
Select-String -Pattern "RTL Support for Hebrew" "$env:USERPROFILE\.vscode\extensions\anthropic.claude-code-*\webview\index.css"

# בדוק לוג
Get-Content "$env:USERPROFILE\.vscode\claude-rtl.log"
```

### CSS מוחל פעמיים

**Linux:**
```bash
# הסר CSS ישן והחל מחדש
CLAUDE_EXT=$(ls -dt ~/.vscode/extensions/anthropic.claude-code-* 2>/dev/null | head -1)
CSS_FILE="$CLAUDE_EXT/webview/index.css"
MARKER="/* === RTL Support for Hebrew === */"
FIRST_LINE=$(grep -nF "$MARKER" "$CSS_FILE" | head -1 | cut -d: -f1)
head -n $((FIRST_LINE - 2)) "$CSS_FILE" > "${CSS_FILE}.tmp"
mv "${CSS_FILE}.tmp" "$CSS_FILE"
cat ~/.vscode/claude-rtl.css >> "$CSS_FILE"
```

**Windows (PowerShell):**
```powershell
$extDir = Get-ChildItem "$env:USERPROFILE\.vscode\extensions" -Directory -Filter "anthropic.claude-code-*" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
$cssFile = Join-Path $extDir.FullName "webview\index.css"
$marker = "/* === RTL Support for Hebrew === */"
$content = Get-Content $cssFile -Raw
$idx = $content.IndexOf($marker)
if ($idx -gt 0) {
    $clean = $content.Substring(0, $idx).TrimEnd()
    $rtlCss = Get-Content "$env:USERPROFILE\.vscode\claude-rtl.css" -Raw
    Set-Content $cssFile -Value ($clean + "`n" + $rtlCss)
}
```

### systemd timer לא רץ (Linux)

```bash
# בדוק סטטוס
systemctl --user status claude-rtl.timer
systemctl --user status claude-rtl.service

# בדוק לוג
journalctl --user -u claude-rtl.service

# טען מחדש
systemctl --user daemon-reload
systemctl --user enable --now claude-rtl.timer
```

### Task Scheduler לא רץ (Windows)

```powershell
# בדוק סטטוס
Get-ScheduledTask -TaskName "Claude RTL CSS" | Select-Object State, LastRunTime, LastTaskResult

# הרץ ידנית
Start-ScheduledTask -TaskName "Claude RTL CSS"

# מחק וצור מחדש
Unregister-ScheduledTask -TaskName "Claude RTL CSS" -Confirm:$false
# ... הרץ שוב את הסקריפט יצירת ה-Task מלמעלה
```

---

## אבטחה

ה-CSS **אסור** שיכיל:
- `<script>` tags
- `javascript:` URLs
- `url()` references (no external resources)
- `@import` statements
- `fetch()` / `XMLHttpRequest` calls
- `expression()` (IE exploit)
- `data:` URIs
- `-moz-binding`

הסקריפט בודק את כל אלה **לפני** החלה ומסרב אם מוצא.

---

## CSS Class Reference

| Module | Class Prefix | תפקיד |
|--------|-------------|--------|
| Chat | `message_`, `userMessage_` | הודעות צ'אט |
| Tool Output | `container_ULYGFA`, `header_ULYGFA`, `output_ULYGFA` | Bash/Tool blocks |
| Bash | `bashCommand_`, `inputRow_` | פקודות bash |
| Tool Use | `toolUse_`, `toolResult_` | שימוש בכלים |
| Git | `gitOutput_` | פלט git |
| Meta | `metaMessage_`, `modelIndicator_` | מידע מערכת |

> **הערה:** הסיומות (כמו `_ULYGFA`, `_07S1Yg`) עשויות להשתנות בין גרסאות. ה-CSS משתמש ב-`[class*="..."]` (contains) כדי לתפוס כל סיומת.

---

## CSS Variables זמינים

```css
/* Claude Code custom */
--app-claude-orange: #d97757

/* VSCode theme (automatic) */
--vscode-foreground
--vscode-editor-foreground
--vscode-editor-background
--vscode-sideBar-background
--vscode-descriptionForeground
--vscode-textLink-foreground
--vscode-textPreformat-foreground
--vscode-textPreformat-background
--vscode-textBlockQuote-background
--vscode-widget-border
--vscode-editor-selectionBackground
--vscode-editor-lineHighlightBackground
--vscode-list-hoverBackground
--vscode-gitDecoration-addedResourceForeground
--vscode-gitDecoration-deletedResourceForeground

/* From settings.json */
--vscode-chat-font-size   /* controlled by "chat.fontSize" */
```
