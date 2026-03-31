---
name: workflows
description: n8n automation - Webhooks, integrations, workflow patterns and automation best practices.
---

# **WORKFLOWS.md - n8n & Automation Guidelines**

**Version:** 1.0.0  
**Purpose:** תבניות, patterns ו-best practices לעבודה עם n8n ואינטגרציות.

## **Table of Contents**

1. [n8n Basics](#n8n-basics)
2. [Webhook Patterns](#webhook-patterns)
3. [Error Handling](#error-handling)
4. [Database Integration](#database-integration)
5. [WhatsApp Integration](#whatsapp-integration)
6. [Common Workflows](#common-workflows)
7. [Expression Syntax](#expression-syntax)
8. [Security Best Practices](#security-best-practices)
9. [Debugging](#debugging)

---

## **n8n Basics**

### **Workflow Structure**

```
[Trigger] → [Validation] → [Process] → [Output] → [Notification/Log]

Every workflow should have:
1. Clear trigger (Webhook/Schedule/Event)
2. Input validation
3. Error handling
4. Success/Failure notification
```

### **Naming Conventions**

| Element | Format | Example |
|---------|--------|---------|
| Workflow | `[Action]_[Entity]_[Trigger]` | `Create_Lead_Webhook` |
| Node | `[Action]_[Target]` | `Send_WhatsApp`, `Insert_Lead` |
| Variable | camelCase | `customerPhone`, `leadData` |
| Credential | `[Service]_[Environment]` | `Supabase_Production` |

### **Environment Variables**

```
Store in n8n Settings > Variables:

SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=xxx
WHATSAPP_API_URL=https://api.whatsapp.com
WEBHOOK_SECRET=xxx
NOTIFICATION_EMAIL=alerts@domain.com
```

Access in expressions: `{{ $env.SUPABASE_URL }}`

---

## **Webhook Patterns**

### **Basic Webhook Handler**

```
[Webhook] → [IF: Validate] → [Process] → [Respond]
                ↓ (invalid)
           [Respond Error]
```

### **Webhook Node Settings**

```json
{
  "httpMethod": "POST",
  "path": "lead-intake",
  "responseMode": "responseNode",
  "options": {
    "rawBody": true
  }
}
```

### **Signature Verification**

```javascript
// Code Node: Verify Webhook Signature
const crypto = require('crypto');

const payload = $input.first().json;
const signature = $input.first().headers['x-webhook-signature'];
const secret = $env.WEBHOOK_SECRET;

const expectedSignature = crypto
  .createHmac('sha256', secret)
  .update(JSON.stringify(payload))
  .digest('hex');

if (signature !== expectedSignature) {
  throw new Error('Invalid webhook signature');
}

return [{ json: { verified: true, data: payload } }];
```

### **Response Patterns**

```javascript
// Success Response
{
  "success": true,
  "message": "Lead created successfully",
  "id": "{{ $json.id }}"
}

// Error Response
{
  "success": false,
  "error": "Validation failed",
  "details": "{{ $json.error }}"
}
```

---

## **Error Handling**

### **Error Workflow Pattern**

```
[Main Workflow] --onError--> [Error Handler Workflow]

Error Handler:
[Error Trigger] → [Format Error] → [Log to DB] → [Send Alert]
```

### **Error Handler Node**

```javascript
// Code Node: Format Error
const error = $input.first().json;

return [{
  json: {
    workflow: $workflow.name,
    node: error.node?.name || 'Unknown',
    message: error.message,
    timestamp: new Date().toISOString(),
    execution_id: $execution.id,
    input_data: JSON.stringify(error.data || {}).slice(0, 1000)
  }
}];
```

### **Retry Pattern**

```
[Process] → [IF: Success?] → [Continue]
                ↓ (failure)
          [Wait 5s] → [Retry Counter] → [IF: < 3 retries] → [Process]
                                              ↓ (>= 3)
                                         [Alert & Log]
```

### **Retry Counter Logic**

```javascript
// Code Node: Retry Counter
const retryCount = $json.retry_count || 0;

if (retryCount >= 3) {
  throw new Error(`Max retries exceeded after ${retryCount} attempts`);
}

return [{
  json: {
    ...($json),
    retry_count: retryCount + 1
  }
}];
```

---

## **Database Integration**

### **Supabase Pattern**

```
[Trigger] → [Supabase: Select/Check] → [IF: Exists?] → [Update/Insert] → [Respond]
```

### **Supabase Insert**

```javascript
// HTTP Request Node Settings
{
  "method": "POST",
  "url": "={{ $env.SUPABASE_URL }}/rest/v1/leads",
  "headers": {
    "apikey": "={{ $env.SUPABASE_KEY }}",
    "Authorization": "Bearer {{ $env.SUPABASE_KEY }}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
  },
  "body": {
    "name": "={{ $json.name }}",
    "phone": "={{ $json.phone }}",
    "email": "={{ $json.email }}",
    "source": "={{ $json.source || 'website' }}",
    "created_at": "={{ new Date().toISOString() }}"
  }
}
```

### **Supabase Select**

```javascript
// HTTP Request: Check if exists
{
  "method": "GET",
  "url": "={{ $env.SUPABASE_URL }}/rest/v1/leads?phone=eq.{{ $json.phone }}&select=id,name,phone",
  "headers": {
    "apikey": "={{ $env.SUPABASE_KEY }}",
    "Authorization": "Bearer {{ $env.SUPABASE_KEY }}"
  }
}
```

### **Upsert Pattern**

```javascript
// HTTP Request: Upsert
{
  "method": "POST",
  "url": "={{ $env.SUPABASE_URL }}/rest/v1/leads",
  "headers": {
    "apikey": "={{ $env.SUPABASE_KEY }}",
    "Authorization": "Bearer {{ $env.SUPABASE_KEY }}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=representation"
  },
  "body": {
    "phone": "={{ $json.phone }}",
    "name": "={{ $json.name }}",
    "updated_at": "={{ new Date().toISOString() }}"
  }
}
```

---

## **WhatsApp Integration**

### **Send Message Pattern**

```
[Trigger] → [Format Message] → [Send WhatsApp] → [Log] → [Respond]
```

### **WhatsApp API Request**

```javascript
// HTTP Request Node (Meta/360dialog/etc.)
{
  "method": "POST",
  "url": "={{ $env.WHATSAPP_API_URL }}/messages",
  "headers": {
    "Authorization": "Bearer {{ $env.WHATSAPP_TOKEN }}",
    "Content-Type": "application/json"
  },
  "body": {
    "messaging_product": "whatsapp",
    "to": "={{ $json.phone.replace(/[^0-9]/g, '') }}",
    "type": "template",
    "template": {
      "name": "{{ $json.template_name }}",
      "language": { "code": "he" },
      "components": [
        {
          "type": "body",
          "parameters": [
            { "type": "text", "text": "={{ $json.customer_name }}" }
          ]
        }
      ]
    }
  }
}
```

### **Phone Number Formatting**

```javascript
// Code Node: Format Israeli Phone
const phone = $json.phone;

// Remove all non-digits
let cleaned = phone.replace(/[^0-9]/g, '');

// Handle different formats
if (cleaned.startsWith('972')) {
  // Already international
} else if (cleaned.startsWith('0')) {
  cleaned = '972' + cleaned.slice(1);
} else {
  cleaned = '972' + cleaned;
}

return [{ json: { ...($json), phone_formatted: cleaned } }];
```

---

## **Common Workflows**

### **1. Lead Intake**

```
[Webhook: /lead] 
    → [Validate: phone, name]
    → [Format Phone]
    → [Check Duplicate]
    → [IF: New Lead?]
        → Yes: [Insert to DB] → [Send WhatsApp Welcome] → [Notify Sales]
        → No: [Update Lead] → [Log Duplicate]
    → [Respond Success]
```

### **2. Scheduled Report**

```
[Schedule: Daily 9:00]
    → [Query: Yesterday's Data]
    → [Aggregate Stats]
    → [Format Report]
    → [Send Email]
    → [Log Execution]
```

### **3. Form Submission Handler**

```
[Webhook: /form]
    → [Validate Fields]
    → [Sanitize Input]
    → [Save to DB]
    → [IF: Has Email?]
        → Yes: [Send Confirmation Email]
    → [IF: Has Phone?]
        → Yes: [Send WhatsApp]
    → [Respond Success]
```

### **4. Sync Workflow**

```
[Schedule: Every 15 min]
    → [Fetch from Source API]
    → [Loop: Each Item]
        → [Check if Exists]
        → [Upsert to DB]
    → [Log Sync Summary]
```

---

## **Expression Syntax**

### **Common Expressions**

```javascript
// Access current item
{{ $json.fieldName }}

// Access from specific node
{{ $('NodeName').item.json.field }}

// All items from node
{{ $('NodeName').all() }}

// Environment variables
{{ $env.VARIABLE_NAME }}

// Execution info
{{ $execution.id }}
{{ $workflow.name }}

// Date/Time
{{ new Date().toISOString() }}
{{ $now.format('YYYY-MM-DD') }}
{{ $now.minus({ days: 1 }).toISO() }}

// Conditional
{{ $json.status === 'active' ? 'כן' : 'לא' }}

// String manipulation
{{ $json.name.trim().toLowerCase() }}
{{ $json.text.slice(0, 100) }}

// Number formatting
{{ Number($json.amount).toFixed(2) }}

// Array operations
{{ $json.items.length }}
{{ $json.items.map(i => i.name).join(', ') }}
{{ $json.items.filter(i => i.active) }}
```

### **Null Safety**

```javascript
// Safe access
{{ $json.user?.name || 'Unknown' }}
{{ $json.items?.length || 0 }}

// Default values
{{ $json.status ?? 'pending' }}
```

---

## **Security Best Practices**

### **Secrets Management**

```
✅ Store secrets in n8n Credentials or Environment Variables
✅ Use {{ $env.SECRET }} - never hardcode
✅ Rotate secrets regularly
✅ Different credentials per environment

❌ Never log full API keys
❌ Never expose secrets in webhook responses
❌ Never commit secrets to git
```

### **Input Validation**

```javascript
// Code Node: Validate Input
const data = $json;
const errors = [];

// Required fields
if (!data.phone) errors.push('Phone is required');
if (!data.name) errors.push('Name is required');

// Format validation
const phoneRegex = /^0[5-9]\d{8}$/;
if (data.phone && !phoneRegex.test(data.phone.replace(/[^0-9]/g, ''))) {
  errors.push('Invalid phone format');
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (data.email && !emailRegex.test(data.email)) {
  errors.push('Invalid email format');
}

if (errors.length > 0) {
  throw new Error(`Validation failed: ${errors.join(', ')}`);
}

return [{ json: { validated: true, data } }];
```

### **Rate Limiting**

```
[Webhook] → [Check Rate Limit] → [IF: Under Limit?]
                                    → Yes: [Process]
                                    → No: [Respond 429]
```

---

## **Debugging**

### **Logging Pattern**

```javascript
// Code Node: Debug Logger
console.log('=== Debug Info ===');
console.log('Workflow:', $workflow.name);
console.log('Node:', 'Debug_Logger');
console.log('Execution:', $execution.id);
console.log('Input:', JSON.stringify($json, null, 2));
console.log('==================');

return $input.all();
```

### **Debug Workflow**

```
Add these nodes for debugging:

[Process] → [Debug: Log Input] → [Process] → [Debug: Log Output]

Debug Node = Code Node that logs and passes through:

return $input.all().map(item => {
  console.log(JSON.stringify(item.json, null, 2));
  return item;
});
```

### **Common Issues & Solutions**

| Issue | Solution |
|-------|----------|
| Empty $json | Check previous node output, use `$input.first().json` |
| Expression not evaluating | Wrap in `{{ }}`, check syntax |
| Webhook not responding | Set Response Mode to "Last Node" |
| Credentials error | Verify credential scope and permissions |
| Loop not working | Check "Execute Once" setting |
| Data not passing between nodes | Verify connection and execution path |

### **Testing Webhooks**

```bash
# Test with curl
curl -X POST https://your-n8n.com/webhook/lead-intake \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "phone": "0501234567"}'

# Test with httpie
http POST https://your-n8n.com/webhook/lead-intake \
  name="Test" phone="0501234567"
```

---

## **Checklist**

Before deploying a workflow:

- [ ] **Naming**: Descriptive workflow and node names
- [ ] **Validation**: All inputs validated
- [ ] **Errors**: Error handling workflow connected
- [ ] **Secrets**: All credentials in secure storage
- [ ] **Logging**: Key steps logged
- [ ] **Testing**: Tested with real and edge-case data
- [ ] **Documentation**: Workflow purpose documented in description
- [ ] **Alerts**: Failure notifications configured
- [ ] **Timeout**: Reasonable timeout settings
- [ ] **Cleanup**: No debug nodes in production
