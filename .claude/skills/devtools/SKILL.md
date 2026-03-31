---
name: devtools
description: Development utilities & scripts - Bash commands, Git shortcuts, Docker helpers, debugging tools and environment setup.
---

# **DEVTOOLS.md - Development Utilities & Scripts**

**Version:** 1.0.0
**Purpose:** כלים, סקריפטים ופונקציות שימושיות לפיתוח.

---

## **Bash Utilities**

### **Quick Server Check**
```bash
# System status one-liner
echo "=== System ===" && uptime && echo "=== Memory ===" && free -h && echo "=== Disk ===" && df -h / && echo "=== Docker ===" && docker ps --format "table {{.Names}}\t{{.Status}}"
```

### **Find Large Files**
```bash
find /home -type f -size +100M -exec ls -lh {} \; 2>/dev/null | sort -k5 -h
```

### **Watch Logs**
```bash
# Docker container logs
docker logs -f --tail 100 container_name

# System logs
journalctl -f -u nginx
```

### **Quick Backup**
```bash
# Backup project
tar -czf backup_$(date +%Y%m%d_%H%M%S).tar.gz /home/ubuntu/project_name

# Backup with exclusions
tar --exclude='node_modules' --exclude='.next' -czf backup.tar.gz ./project
```

---

## **Git Utilities**

### **Quick Commit**
```bash
# Add all + commit + push
git add -A && git commit -m "message" && git push

# Alias (add to .bash_aliases)
alias gcp='git add -A && git commit -m'
```

### **Undo Last Commit (keep changes)**
```bash
git reset --soft HEAD~1
```

### **Clean Branches**
```bash
# Delete merged branches
git branch --merged | grep -v "\*\|main\|master" | xargs -n 1 git branch -d
```

### **Pretty Log**
```bash
git log --oneline --graph --decorate -20
```

### **Stash with Name**
```bash
git stash push -m "description"
git stash list
git stash pop stash@{0}
```

---

## **Docker Utilities**

### **Cleanup**
```bash
# Remove unused images, containers, volumes
docker system prune -af --volumes

# Remove only dangling images
docker image prune -f
```

### **Quick Rebuild**
```bash
docker-compose down && docker-compose build --no-cache && docker-compose up -d
```

### **Enter Container**
```bash
docker exec -it container_name /bin/sh
# or for bash
docker exec -it container_name /bin/bash
```

### **Copy From Container**
```bash
docker cp container_name:/path/to/file ./local_path
```

### **View Container Logs**
```bash
# Follow logs
docker logs -f container_name

# Last 100 lines
docker logs --tail 100 container_name

# With timestamps
docker logs -t container_name
```

---

## **Node.js Utilities**

### **Clear Cache**
```bash
# npm
npm cache clean --force
rm -rf node_modules package-lock.json && npm install

# pnpm
pnpm store prune
rm -rf node_modules pnpm-lock.yaml && pnpm install
```

### **Check Outdated**
```bash
npm outdated
# or
pnpm outdated
```

### **Security Audit**
```bash
npm audit
npm audit fix
```

### **List Global Packages**
```bash
npm list -g --depth=0
```

---

## **Next.js Utilities**

### **Clear Build Cache**
```bash
rm -rf .next out node_modules/.cache
```

### **Analyze Bundle**
```bash
# Add to package.json scripts:
# "analyze": "ANALYZE=true next build"
npm run analyze
```

### **Type Check Without Build**
```bash
npx tsc --noEmit
```

### **Generate Types from Supabase**
```bash
npx supabase gen types typescript --project-id your-project-id > types/supabase.ts
```

---

## **Supabase Utilities**

### **Quick Query (curl)**
```bash
curl -X GET "${SUPABASE_URL}/rest/v1/table_name?select=*" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}"
```

### **Insert Row (curl)**
```bash
curl -X POST "${SUPABASE_URL}/rest/v1/table_name" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"name": "test", "email": "test@example.com"}'
```

### **RLS Debug**
```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- View policies
SELECT * FROM pg_policies WHERE tablename = 'your_table';
```

### **Common Queries**
```sql
-- Count by status
SELECT status, COUNT(*) FROM leads GROUP BY status;

-- Recent records
SELECT * FROM leads ORDER BY created_at DESC LIMIT 10;

-- Search
SELECT * FROM leads WHERE name ILIKE '%search%';
```

---

## **SSL/Certbot Utilities**

### **New Certificate**
```bash
certbot --nginx -d domain.com -d www.domain.com
```

### **Renew All**
```bash
certbot renew --dry-run  # Test first
certbot renew
```

### **Check Expiry**
```bash
certbot certificates
```

### **Delete Certificate**
```bash
certbot delete --cert-name domain.com
```

---

## **Network Utilities**

### **Check Open Ports**
```bash
netstat -tulanp | grep LISTEN
# or
ss -tulanp | grep LISTEN
```

### **Test Port**
```bash
nc -zv hostname 443
```

### **Check DNS**
```bash
dig domain.com
nslookup domain.com
```

### **Test HTTP**
```bash
curl -I https://domain.com
http --headers https://domain.com
```

### **Find Process Using Port**
```bash
lsof -i :3000
# or
fuser 3000/tcp
```

---

## **Monitoring One-Liners**

### **CPU/Memory Top Processes**
```bash
ps aux --sort=-%mem | head -10
ps aux --sort=-%cpu | head -10
```

### **Disk Usage by Folder**
```bash
du -sh /home/ubuntu/*/ | sort -h
```

### **Watch Docker Stats**
```bash
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
```

### **Real-time Network Traffic**
```bash
iftop -i eth0
```

---

## **TypeScript Utilities**

### **Common Zod Schemas**
```typescript
import { z } from 'zod';

// Israeli phone
export const phoneSchema = z.string().regex(/^05\d{8}$/, "מספר לא תקין");

// Israeli ID
export const israeliIdSchema = z.string().regex(/^\d{9}$/, "ת.ז לא תקינה");

// Hebrew text only
export const hebrewSchema = z.string().regex(/^[\u0590-\u05FF\s]+$/, "עברית בלבד");

// Email (optional)
export const optionalEmail = z.string().email().optional().or(z.literal(''));

// Date string
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

// Positive number
export const positiveNumber = z.number().positive("חייב להיות חיובי");

// Non-empty string
export const requiredString = z.string().min(1, "שדה חובה");
```

### **API Response Type**
```typescript
type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    page?: number;
    total?: number;
    hasMore?: boolean;
  };
};

// Usage
function success<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

function error(message: string, status = 400): Response {
  return Response.json({ success: false, error: message }, { status });
}
```

### **Async Handler Wrapper**
```typescript
type Handler<T> = (req: Request) => Promise<T>;

function asyncHandler<T>(fn: Handler<T>) {
  return async (req: Request): Promise<Response> => {
    try {
      const result = await fn(req);
      return Response.json({ success: true, data: result });
    } catch (err) {
      console.error('API Error:', err);
      const message = err instanceof Error ? err.message : 'Internal Server Error';
      return Response.json({ success: false, error: message }, { status: 500 });
    }
  };
}
```

### **Date Utilities**
```typescript
// Format date for display (Hebrew)
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('he-IL');
}

// Format datetime
export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString('he-IL');
}

// Relative time
export function timeAgo(date: Date | string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);

  if (seconds < 60) return 'עכשיו';
  if (seconds < 3600) return `לפני ${Math.floor(seconds / 60)} דקות`;
  if (seconds < 86400) return `לפני ${Math.floor(seconds / 3600)} שעות`;
  return `לפני ${Math.floor(seconds / 86400)} ימים`;
}
```

---

## **Environment Setup**

### **.env.local Template**
```bash
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=MyApp

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# WhatsApp
WHATSAPP_API_URL=https://graph.facebook.com/v17.0
WHATSAPP_TOKEN=xxx
WHATSAPP_PHONE_ID=xxx

# n8n
N8N_WEBHOOK_URL=https://n8n.domain.com/webhook
N8N_API_KEY=xxx

# Optional
RESEND_API_KEY=xxx
SENTRY_DSN=xxx
```

### **Useful Aliases (.bash_aliases)**
```bash
# Navigation
alias ..='cd ..'
alias ...='cd ../..'
alias ll='ls -alF'
alias la='ls -A'

# Git
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git pull'
alias gd='git diff'
alias lg='lazygit'
alias gcp='git add -A && git commit -m'

# Docker
alias dc='docker-compose'
alias dcu='docker-compose up -d'
alias dcd='docker-compose down'
alias dcl='docker-compose logs -f'
alias dps='docker ps'
alias dex='docker exec -it'

# npm/pnpm
alias ni='pnpm install'
alias nr='pnpm run'
alias nd='pnpm run dev'
alias nb='pnpm run build'
alias nt='pnpm run test'

# System
alias ports='netstat -tulanp | grep LISTEN'
alias myip='curl -s ifconfig.me'
alias update='apt update && apt upgrade -y'
alias bt='btop'

# Claude
alias cc='claude'
```

---

## **New Project Checklist**

```bash
# 1. Clone/Create
git clone repo_url && cd project_name
# or
npx create-next-app@latest project_name --typescript --tailwind --app

# 2. Install dependencies
pnpm install

# 3. Setup environment
cp .env.example .env.local
# Edit .env.local with your values

# 4. Setup database (if Supabase)
# - Create project in Supabase dashboard
# - Run migrations
# - Enable RLS on all tables

# 5. Copy project files
cp ~/ClaudeCode/CLAUDE.md ./CLAUDE.md
cp ~/.claude/skills/fullstack-il/PROJECT.md ./PROJECT.md

# 6. Initialize git (if new)
git init
echo "node_modules\n.next\n.env*.local" >> .gitignore
git add -A && git commit -m "Initial commit"

# 7. Run development server
pnpm dev

# 8. Open in browser
open http://localhost:3000
```

---

## **Debugging Checklist**

When something doesn't work:

1. **Check logs**
   ```bash
   docker logs container_name
   journalctl -u service_name -f
   ```

2. **Check environment variables**
   ```bash
   printenv | grep SUPABASE
   ```

3. **Check ports**
   ```bash
   netstat -tulanp | grep :3000
   ```

4. **Check disk space**
   ```bash
   df -h
   ```

5. **Check memory**
   ```bash
   free -h
   ```

6. **Check DNS**
   ```bash
   dig domain.com
   ```

7. **Test connectivity**
   ```bash
   curl -I https://api.example.com
   ```
