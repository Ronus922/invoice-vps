---
name: webapp-testing
description: Playwright-based toolkit for testing and interacting with local web applications — server lifecycle management, reconnaissance pattern, screenshot capture, DOM inspection, browser logs. Extends /qa with server management and systematic testing approach. Use when testing local webapps, debugging UI behavior, capturing screenshots of running apps, or automating browser interactions. Triggers: "test webapp", "Playwright test", "browser automation", "test running app", "screenshot app", "debug UI", "automate browser".
---

# Web App Testing

> Playwright Python לבדיקות ואינטראקציה עם webapps מקומיים.
> כולל ניהול lifecycle של servers ו-Reconnaissance pattern.

---

## Decision Tree

```
Task → האם זה static HTML?
    ├─ כן  → קרא HTML ישירות → זיהוי selectors → כתוב Playwright script
    │
    └─ לא (dynamic webapp) → האם ה-server כבר רץ?
        ├─ לא → השתמש ב-with_server.py להפעלה
        │
        └─ כן → Reconnaissance-then-Action:
            1. Navigate + wait for networkidle
            2. Screenshot + inspect DOM
            3. זהה selectors
            4. בצע actions
```

---

## Server Lifecycle Management

### with_server.py Pattern
```bash
# Single server
python scripts/with_server.py \
  --server "npm run dev" --port 3000 \
  -- python your_test.py

# Multiple servers (backend + frontend)
python scripts/with_server.py \
  --server "cd backend && python server.py" --port 8000 \
  --server "cd frontend && npm run dev" --port 3000 \
  -- python your_test.py
```

**בתוך your_test.py:**
```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)  # תמיד headless=True
    page = browser.new_page()
    page.goto('http://localhost:3000')
    page.wait_for_load_state('networkidle')  # חיוני ל-SPAs!
    # ... automation logic
    browser.close()
```

---

## Reconnaissance-Then-Action Pattern

### Step 1: Inspect (לפני action)
```python
# Screenshot מלא
page.screenshot(path='/tmp/inspect.png', full_page=True)

# DOM content
content = page.content()

# כל הbuttons
buttons = page.locator('button').all()
for btn in buttons:
    print(btn.text_content(), btn.get_attribute('class'))

# Form inputs
inputs = page.locator('input, select, textarea').all()
```

### Step 2: Identify Selectors
```python
# עדיפות selectors (מהטוב לגרוע):
page.get_by_role('button', name='Submit')       # ✅ accessible
page.get_by_label('Email')                        # ✅ form labels
page.get_by_test_id('submit-btn')                 # ✅ data-testid
page.locator('[data-testid="submit"]')            # ✅
page.locator('#submit-btn')                       # בסדר
page.locator('.submit-button')                    # ⚠️ fragile
page.locator('div > span > button:nth-child(2)') # ❌ מאוד fragile
```

### Step 3: Execute Actions
```python
# Click
page.get_by_role('button', name='Submit').click()

# Fill form
page.get_by_label('Email').fill('test@example.com')
page.get_by_label('Password').fill('password123')

# Wait for navigation
with page.expect_navigation():
    page.get_by_role('button', name='Login').click()

# Wait for element
page.wait_for_selector('.dashboard-loaded', state='visible', timeout=10000)

# Assert
assert page.get_by_text('Welcome back').is_visible()
```

---

## Common Test Patterns

### Login Flow
```python
def test_login(page):
    page.goto('http://localhost:3000/login')
    page.wait_for_load_state('networkidle')

    page.get_by_label('Email').fill('user@example.com')
    page.get_by_label('Password').fill('password')
    page.get_by_role('button', name='Sign In').click()

    page.wait_for_url('**/dashboard', timeout=5000)
    assert page.get_by_role('heading', name='Dashboard').is_visible()
```

### API + UI Integration
```python
# Mock API responses
page.route('**/api/users', lambda route: route.fulfill(
    status=200,
    content_type='application/json',
    body='[{"id": 1, "name": "Test User"}]'
))
```

### Screenshot on Failure
```python
try:
    page.get_by_role('button', name='Submit').click()
    page.wait_for_selector('.success', timeout=5000)
except Exception as e:
    page.screenshot(path=f'/tmp/failure_{timestamp}.png')
    raise
```

---

## Docker Container Testing

```python
# בדיקת container שרץ ב-127.0.0.1:PORT
page.goto('http://127.0.0.1:3000')
page.wait_for_load_state('networkidle')

# Health check endpoint
response = page.request.get('http://127.0.0.1:3000/health')
assert response.status == 200
data = response.json()
assert data['status'] == 'ok'
```

---

## Browser Logs Capture
```python
# Console logs
logs = []
page.on('console', lambda msg: logs.append(f"[{msg.type}] {msg.text}"))

# Network errors
page.on('response', lambda res: (
    print(f"❌ {res.status} {res.url}") if res.status >= 400 else None
))

page.goto('http://localhost:3000')
page.wait_for_load_state('networkidle')
print('\n'.join(logs))
```

---

## Common Pitfalls

- **לא לחכות ל-networkidle** — SPAs/React apps לא גמורים מיד אחרי load
- **XPath > role/label** — הפוך: role/label עדיף תמיד
- **hardcoded timeouts** — `wait_for_selector` > `time.sleep()`
- **לא לצלם screenshot** — תמיד screenshot אחרי failure לdiagnosis
- **לטעון source** — עדיף לקרוא `--help` של scripts קודם

---

## Integration עם /qa

```
/qa         — methodology, test structure, CI/CD, Playwright setup
/webapp-testing — server lifecycle, reconnaissance, runtime interaction

השלמה:
/qa → test architecture + strategy
/webapp-testing → execution patterns + server management
```
