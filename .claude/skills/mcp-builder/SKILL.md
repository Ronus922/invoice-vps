---
name: mcp-builder
description: Guide for building MCP (Model Context Protocol) servers — integrates external APIs/services with Claude via tools, resources, and prompts. 4-phase workflow: Research → Implement → Evaluate → Publish. Python (FastMCP) and TypeScript (MCP SDK). Triggers: "build MCP server", "MCP integration", "create MCP", "connect API to Claude", "MCP tool", "FastMCP", "modelcontextprotocol".
---

# MCP Server Builder

> מדריך לבניית MCP servers איכותיים — גישר בין Claude לכל API חיצוני.

---

## מתי להשתמש

- מחברים API חיצוני (GitHub, Supabase, Slack, כל REST API) ל-Claude
- בונים כלים שClaude יכול לקרוא בשיחה
- מאפשרים ל-n8n / automations לעבוד עם Claude דרך MCP
- יוצרים DevOPS tools (Docker status, server monitor) כ-MCP

---

## 4-Phase Workflow

### Phase 1: Research & Planning

**API Coverage vs Workflow Tools:**
```
Comprehensive API coverage → גמישות מקסימלית לagents
Workflow tools           → נוחות לtasks ספציפיים
כשיש ספק               → עדיפות ל-API coverage
```

**Tool Naming (חיוני לdiscoverability):**
```typescript
// ✅ טוב — prefix + action + noun
github_create_issue
github_list_repos
docker_get_container_status

// ❌ גרוע
create_issue
get_status
run
```

**Error Messages — חייבות להיות actionable:**
```typescript
// ✅
"Container 'my-app' not found. Available: [api, db, nginx]. Use docker_list_containers to see all."

// ❌
"Container not found"
```

**מחקר:**
- קרא OpenAPI/swagger של ה-API
- בדוק: `https://modelcontextprotocol.io/sitemap.xml`
- TypeScript SDK: `https://github.com/modelcontextprotocol/typescript-sdk`
- Python SDK: `https://github.com/modelcontextprotocol/python-sdk`

---

### Phase 2: Implementation

#### Stack מומלץ

| שכבה | בחירה | סיבה |
|------|--------|-------|
| **שפה** | TypeScript | Static typing, AI-friendly, broad ecosystem |
| **Transport (remote)** | Streamable HTTP stateless | קל לscale, ללא sessions |
| **Transport (local)** | stdio | פשוט, מהיר |
| **Python alt** | FastMCP | הכי קל להתחיל |

#### TypeScript Project Structure
```
my-mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # server entry point
│   ├── tools/            # tool handlers
│   └── resources/        # resource handlers (אם צריך)
└── build/
```

#### TypeScript Boilerplate
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "my-service-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "service_action",
    description: "Clear description with when-to-use context",
    inputSchema: {
      type: "object",
      properties: {
        param: { type: "string", description: "what this param does" }
      },
      required: ["param"]
    }
  }]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "service_action") {
    const { param } = request.params.arguments as { param: string };
    // implementation
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
  throw new Error(`Tool not found: ${request.params.name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

#### Python (FastMCP) Boilerplate
```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("my-service")

@mcp.tool()
def service_action(param: str) -> str:
    """Clear description with when-to-use context."""
    # implementation
    return result

if __name__ == "__main__":
    mcp.run()
```

---

### Phase 3: Tool Design Rules

#### Annotations (TypeScript SDK)
```typescript
{
  name: "read_file",
  annotations: {
    readOnlyHint: true,      // לא משנה state
    destructiveHint: false,  // לא מוחק נתונים
    idempotentHint: true,    // בטוח לקרוא כמה פעמים
    openWorldHint: false     // לא ניגש לאינטרנט
  }
}
```

#### Pagination לתוצאות גדולות
```typescript
// תמיד תמוך ב-pagination
{
  name: "list_items",
  inputSchema: {
    properties: {
      limit: { type: "number", default: 50, maximum: 200 },
      cursor: { type: "string", description: "Pagination cursor" }
    }
  }
}
```

#### Context Management
- החזר רק נתונים רלוונטיים — לא dumps מלאים
- השתמש ב-`include_fields` / `exclude_fields` parameters
- תמוך ב-search/filter כדי להצמצם תוצאות

---

### Phase 4: Evaluate & Register

#### Evaluation Questions (לפני publish)
```
□ האם כל tool name ברור ויחודי?
□ האם error messages actionable?
□ האם pagination מוגדרת לtool שמחזיר רשימות?
□ האם readOnlyHint/destructiveHint מוגדרים?
□ האם ה-tool עובד עם בדיקת integration?
□ האם לא חשוף secrets/credentials ב-logs?
```

#### רישום ב-Claude Code
```bash
# Local stdio server
claude mcp add my-server -- node build/index.js

# Remote HTTP server
claude mcp add my-server --transport http https://my-server.example.com/mcp

# עם environment variables
claude mcp add my-server -e API_KEY=xxx -- node build/index.js

# בדיקה
claude mcp list
claude mcp get my-server
```

---

## Patterns נפוצים

### CRUD Resource Pattern
```typescript
// list_{resource}s
// get_{resource}
// create_{resource}
// update_{resource}
// delete_{resource}  ← destructiveHint: true
```

### DevOPS Integration (קייס שלנו)
```typescript
// Docker MCP
docker_list_containers  // readOnly
docker_get_logs         // readOnly, limit lines
docker_restart          // destructive=false, idempotent
docker_exec             // needs explicit confirmation

// Server Monitor MCP
server_get_metrics      // readOnly
server_get_disk_usage   // readOnly
server_run_backup       // idempotent
```

---

## Common Pitfalls
- אל תחשוף credentials ב-tool outputs
- אל תחזיר JSON גדול ללא pagination
- אל תיצור tool names שאינם unique
- אל תשתמש ב-`shell=True` ב-subprocess (injection risk)
