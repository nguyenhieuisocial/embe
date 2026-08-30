# Local core services

The light core runs independently from Immich:

```powershell
docker compose --env-file infra/compose/core.example.env -f infra/compose/core.yml up -d
```

Local-only endpoints:

- BabyBuddy: `http://127.0.0.1:8000`
- Memos: `http://127.0.0.1:5230`
- Grocy: `http://127.0.0.1:9283`
- Node-RED: `http://127.0.0.1:1880`
- Uptime Kuma: `http://127.0.0.1:3001`

## IoT profile

Home Assistant and Mosquitto are optional and remain off until the `iot` profile
is selected. Before the first start, create the ignored runtime directory and an
MQTT password file interactively; never use `mosquitto_passwd -b` because that
puts the password in the process command line.

```powershell
New-Item -ItemType Directory -Force C:\EmBe\secrets\runtime
docker run --rm -it `
  -v C:/EmBe/secrets/runtime:/mosquitto/config `
  eclipse-mosquitto:2.1.2-alpine@sha256:6f8d8a947c506f8a2290ec65cd4bd2bc7cb4d43fb5f6271f861cb013e2ef9797 `
  mosquitto_passwd -c /mosquitto/config/mosquitto-passwordfile homeassistant
docker compose --env-file infra/compose/core.example.env -f infra/compose/core.yml --profile iot up -d
```

Endpoints remain loopback-only:

- MQTT: `127.0.0.1:1883`
- Home Assistant: `http://127.0.0.1:8123`

Bridge networking works for explicit IP/MQTT integrations. Automatic discovery
that depends on host multicast may require a later Linux host deployment; do not
enable privileged or host networking on this Windows workstation merely to make
discovery easier.

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
- <https://nodered.org/docs/getting-started/docker>
- <https://github.com/louislam/uptime-kuma/wiki/%F0%9F%94%A7-How-to-Install>
