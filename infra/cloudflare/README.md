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
- R2 backup bucket: `embe-backup` (APAC, Standard)

Cloudflare Access cho portal đã được gỡ sau khi xác nhận lớp đăng nhập bằng mật
khẩu dùng chung của ứng dụng hoạt động trên cả custom domain và Vercel alias.
Cloudflare hiện giữ vai trò DNS/proxy/WAF; không được tạo bypass hoặc public
route tới các ứng dụng quản trị local.

A Cloudflare Tunnel is intentionally deferred until local services are running.
The Vercel-hosted portal does not need a Tunnel. Tunnel tương lai chỉ dành cho
Local BFF, phải có service authentication riêng và fallback 404.

The R2 bucket is private and reserved for encrypted, compact snapshots. It is
not the primary store for RAW photos or videos, and no public domain is attached
to it.
