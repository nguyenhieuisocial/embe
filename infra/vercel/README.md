# Vercel portal

- Project: `embe-portal`
- Production alias: `https://embe-portal.vercel.app`
- Git source: `nguyenhieuisocial/embe`
- Application root: `apps/portal`
- Custom domain: `https://embe.hieu.asia`

The portal is currently a data-free shell. The custom domain is proxied through
Cloudflare and protected by application-level shared-password authentication.
Password hash and session-signing secret are server-only Vercel Production
secrets; preview deployments do not receive them.
