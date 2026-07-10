# Security Review — AI Prompt Scheduler

Honest, itemized breakdown of what is protected, what the residual risks are, and what
depends on you as the operator. No setup is "100% unhackable" — this document tells you
exactly where the real boundaries are.

---

## ✅ What IS Protected

| Threat | Protection | How it works |
|---|---|---|
| Data in transit (network sniffing) | HTTPS | Railway/Render/Fly all provide free TLS certs automatically |
| Stolen database file | AES-256-GCM encryption | Credentials are encrypted; the raw file is unreadable without your `ENCRYPTION_SECRET` |
| Unauthorized API access | Hashed API key | Your key is never stored in plaintext — only its SHA-256 hash |
| Credential leakage via logs | Log sanitization | Logger strips password/cookie/token fields before writing any log line |
| Brute-force key guessing | Rate limiting | 200 requests / 15 min per IP on the server |
| XSS / malicious script injection in the extension popup | CSP (Content Security Policy) | Manifest V3 blocks inline scripts/handlers by default — enforced automatically by Chrome |
| Cross-origin data leaks | CORS | Server only accepts requests carrying your API key header |

---

## ⚠️ What Is NOT Fully Protected (Residual Risks)

These are inherent to the "you run your own server" model — be aware of them:

1. **If someone gets your `ENCRYPTION_SECRET`, they can decrypt everything.** Treat it like a master password. Never commit it to a public GitHub repo or share it.

2. **If someone gets your server API key, they can schedule prompts and view schedule metadata** — but they still cannot read your raw credentials (those need the separate `ENCRYPTION_SECRET`).

3. **Session cookies expire.** When they do, automation fails with a clear error — just re-save a fresh cookie.

4. **Browser automation can break** if the AI platform changes their site's HTML. Not a security flaw, but expect occasional maintenance.

5. **Brief plaintext exposure during execution.** Like virtually all server-side "encryption at rest" systems, credentials exist in decrypted form in server memory for the moment they're being used to log in. Standard server hardening (SSH-key-only access, firewall, minimal open ports) mitigates this — that part is on you as host operator.

6. **No login screen for your server** — by design, since this is a single-user personal deployment. The API key is the only gate. If you deploy on a public host, anyone who has both your server URL and your API key can use it.

---

## 🔒 Recommended Hardening (Optional)

- Rotate your `ENCRYPTION_SECRET` periodically (requires re-entering credentials)
- If your host supports it, restrict access to your home/office IP via firewall rule
- Enable your provider's built-in DDoS protection (most include this free)
- Never reuse your `ENCRYPTION_SECRET` anywhere else

---

## What This Is NOT

A personal single-user tool, not a production SaaS with enterprise multi-tenant isolation.
It intentionally does not have:
- Google/OAuth login — one person, one server, one API key
- Audit logs / admin dashboards
- Penetration-tested infrastructure

If you ever want to offer this to many users, that needs a different architecture entirely
(centralized server, per-user auth, a proper key vault like AWS KMS/HashiCorp Vault) —
a materially bigger project than this personal tool.
