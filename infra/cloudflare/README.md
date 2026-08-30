# Cloudflare edge

The public family portal hostname is `embe.hieu.asia`.

Required DNS record from Vercel:

- Type: `CNAME`
- Name: `embe`
- Target: `0891723fe44c2f4e.vercel-dns-016.com`
- Proxy: enabled after Vercel domain verification

Cloudflare resources:

- Zone ID: `e942e697a2563edf82ce72580107521c`
- DNS record ID: `47a34dd3a95ed08f8601d2ee8538ec76`
- Access application: `EmBe Family Portal`
- Access application ID: `1027e944-1b5f-4edb-b6e4-b5bddecd9c53`
- Initial allow policy ID: `2eed4b6a-eeee-45b5-b441-837dcded1180`
- R2 backup bucket: `embe-backup` (APAC, Standard)

The initial Access policy only allows the Cloudflare account owner. Add each
family member as an explicit email rule; never use a public or domain-wide bypass.

A Cloudflare Tunnel is intentionally deferred until local services are running.
The Vercel-hosted portal does not need a Tunnel.

The R2 bucket is private and reserved for encrypted, compact snapshots. It is
not the primary store for RAW photos or videos, and no public domain is attached
to it.
