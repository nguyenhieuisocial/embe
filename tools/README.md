# Project toolchain

Rebuildable Windows binaries are installed under `C:\EmBe\tools\bin` and are
excluded from Git. Release assets are downloaded only from the official GitHub
repositories and their SHA-256 digests are checked against GitHub release
metadata before installation.

Installed tool families:

- SOPS 3.13.x
- age 1.3.x
- Restic 0.19.x
- cloudflared 2026.8.x
- Typst 0.15.x

The age private identity is stored at `C:\EmBe\secrets\age\keys.txt`, excluded
from Git, with inherited NTFS permissions removed. Only the public recipient is
stored in `.sops.yaml`.
