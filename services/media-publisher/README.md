# EmBe Media Publisher

Publishes only lightweight previews from explicitly allowlisted Immich albums to the private Supabase bucket used by the family portal.

Safety contract:

- disabled by default;
- accepts only local/private Immich URLs and explicit album UUIDs;
- needs only Immich `asset.read`, `asset.view`, and `asset.download` permissions;
- never publishes originals, filenames, EXIF, GPS, faces, camera data, or credentials;
- validates JPEG/WebP bytes, limits previews to 10 MB, and skips unchanged assets;
- stages metadata before one atomic publication switch.
- uploads at most 50 new previews per run by default, then resumes from stored state on the next run.

Every run writes only counts and timestamps to `data/status/media-publisher.json`; credentials, album IDs, filenames, and media paths are never written to status output.

Run `scripts/provision-immich-media-publisher.ps1` once with the existing Immich
administrator credential. It creates or reuses the curated `Em Bé` album,
creates a key with exactly `asset.read`, `asset.view`, and `asset.download`, writes the restricted
runtime file, and verifies both API routes. Subsequent runs verify the scoped key
without needing the administrator credential. Supabase settings are reused from
the existing private portal sync file. Keep both files outside Git.

Run tests from this directory:

```powershell
$env:PYTHONPATH='.'
python -m unittest discover -s tests -v
```
