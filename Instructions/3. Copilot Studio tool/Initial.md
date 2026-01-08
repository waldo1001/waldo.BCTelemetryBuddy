# BC Telemetry Buddy – MCP Server for Microsoft 365 Copilot Studio

BC Telemetry Buddy is a **Model Context Protocol (MCP) server** that exposes **Azure Application Insights telemetry** as structured tools for **Microsoft 365 Copilot Studio**.

It is designed for **per-user delegated access** using Microsoft Entra ID, ensuring users can **only see telemetry they already have permission to access**.

The solution is built to support **enterprise governance**, **Copilot reliability**, and **global distribution**.

---

## ✨ Key Concepts

* **One Service = One Tool**
  Each MCP endpoint is preconfigured for **exactly one Azure Application Insights resource**.

* **Per-user delegated authentication**
  Telemetry queries run **as the signed-in user**, enforced by Azure RBAC.

* **Admin-configured, user-friendly**
  Admins configure agents and tools. End users just ask questions.

* **Safe by default**
  No API keys, no shared credentials, no unrestricted queries.

---

## 🧭 Architecture Overview

```text
Copilot Studio Agent
        ↓ (OAuth, user token)
BC Telemetry Buddy MCP Server (HTTPS)
        ↓ (delegated auth)
Azure Application Insights REST API
```

* Copilot Studio calls the MCP server as a **tool**
* The MCP server validates the user token
* Telemetry is queried **on behalf of the user**
* Azure enforces access via RBAC

---

## 🔐 Authentication & Authorization

### Authentication

* OAuth 2.0 Authorization Code flow
* Microsoft Entra ID
* **Delegated user authentication only**

Each user signs in once when first using the tool.

### Authorization

* Enforced entirely by **Azure RBAC**
* If a user has no access to the Application Insights resource:

  * The tool fails gracefully
  * A clear error is returned

> The MCP server never uses a tenant-wide or shared credential.

---

## 🎯 Telemetry Scope

Each MCP deployment is **hard-wired to a single Application Insights resource**.

Configured via environment variables:

```env
APPINSIGHTS_RESOURCE_ID=
APPINSIGHTS_APP_ID=
```

The MCP server:

* ❌ Does not accept resource IDs from users
* ❌ Cannot query arbitrary services
* ✅ Guarantees predictable and secure access

This enables admins to expose **multiple services as multiple tools**.

---

## 🛠 Tool Surface

The MCP server exposes a **curated set of telemetry tools** designed for AI agents.

### Example tools

* `getTopExceptions(timeRange)`
* `getFailedRequests(timeRange)`
* `getPerformanceSummary(timeRange)`
* `findTracesByCorrelationId(correlationId)`
* `getDependencyFailures(timeRange)`

### Tool design rules

* Strongly typed inputs
* Structured JSON outputs
* No free-form KQL by default
* Built-in guardrails:

  * Max time ranges
  * Max row counts
  * Predefined query templates

This ensures predictable cost and reliable agent behavior.

---

## 🛡 Guardrails & Reliability

The MCP server enforces:

* Query time limits
* Result size limits
* Graceful handling of:

  * 401 / 403 (no access)
  * 429 (throttling)
  * Network errors

Errors are normalized into **human-readable messages** suitable for Copilot responses.

---

## 🚀 Deployment Model

### Pattern: One Service = One Tool

Use the same codebase, deployed multiple times:

```text
https://telemetrybuddy-sales.contoso.com/mcp
https://telemetrybuddy-warehouse.contoso.com/mcp
```

Each deployment:

* Targets one Application Insights resource
* Appears as a separate tool in Copilot Studio

Alternative:

* Single backend + Azure API Management front doors

---

## 🤖 Microsoft 365 Copilot Studio Integration

Admins:

* Add MCP server(s) as tools
* Configure OAuth (user authentication)
* Attach tools to agents

Users:

* Sign in once when prompted
* Ask questions
* Never choose telemetry endpoints

The agent automatically selects the correct tool.

---

## 🌍 Market Readiness

BC Telemetry Buddy is designed for:

* Global SaaS distribution
* Multi-tenant usage
* Enterprise security & governance
* Power Platform environments

No tenant-specific assumptions are baked into the code.

---

## 🚫 Explicit Non-Goals

This project does **not**:

* Use API keys
* Use shared service principals for telemetry
* Allow unrestricted KQL execution
* Let users choose telemetry endpoints
* Require users to understand Azure Monitor internals

---

## ✅ Summary

BC Telemetry Buddy provides:

* A secure MCP server for Copilot Studio
* Per-user delegated telemetry access
* Preconfigured, admin-controlled tools
* Predictable and safe AI-driven insights

Built for **enterprise Copilot**, **not demos**.

---

## 📄 License

This project is licensed under the **MIT License**.

* ✔ Free to use, modify, and distribute
* ✔ Commercial and non-commercial use permitted
* ✔ Open source and permissive

See the [LICENSE](../../../LICENSE) file for full details.

**Note:** Future versions may be released under a different license. The license applicable to each version is specified in that version's release.
