# Cloudflare edge

The public family portal hostname is `embe.hieu.asia`.

Required DNS record from Vercel:

- Type: `CNAME`
- Name: `embe`
- Target: `0891723fe44c2f4e.vercel-dns-016.com`
- Proxy: disabled until Vercel verifies the domain

After verification, enable Cloudflare proxying and protect the hostname with a
Cloudflare Access self-hosted application. Only explicitly approved family email
addresses may pass the Access policy.
