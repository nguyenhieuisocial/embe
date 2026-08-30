# Local core services

The light core runs independently from Immich:

```powershell
docker compose --env-file infra/compose/core.example.env -f infra/compose/core.yml up -d
```

Local-only endpoints:

- BabyBuddy: `http://127.0.0.1:8000`
- Memos: `http://127.0.0.1:5230`
- Grocy: `http://127.0.0.1:9283`

All published ports bind to loopback. Do not change them to `0.0.0.0` or add
router port forwarding. Application state is stored below
`C:\EmBe\data\appdata` and is excluded from Git.

## Immich safety gate

Immich is intentionally separated in `media.yml` and must not be started until
`C:\EmBe\data\media` resolves to a dedicated non-system disk with at least 25%
free space:

```powershell
pwsh -NoProfile -File scripts/verify-media-storage.ps1 -MediaPath C:\EmBe\data\media
```

After the gate passes, create an ignored `infra/compose/core.env` from the
example and inject a strong `IMMICH_DB_PASSWORD` from SOPS. Then start the
combined stack with the media profile:

```powershell
docker compose --env-file infra/compose/core.env -f infra/compose/core.yml -f infra/compose/media.yml --profile media up -d
```

Never put the database password in `core.example.env`, Git, Obsidian, or shell
history. The media stack is pinned to the official Immich release Compose
dependencies and is not exposed beyond localhost.

Official deployment references:

- <https://docs.baby-buddy.net/setup/deployment/>
- <https://usememos.com/docs/deploy/docker>
- <https://docs.linuxserver.io/images/docker-grocy>
- <https://docs.immich.app/install/docker-compose>
