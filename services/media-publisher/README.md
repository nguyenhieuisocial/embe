# EmBe Media Publisher

Publishes only lightweight previews from explicitly allowlisted Immich albums to the private Supabase bucket used by the family portal.

Safety contract:

- disabled by default;
- accepts only local/private Immich URLs and explicit album UUIDs;
- needs only Immich `asset.read` and `asset.view` permissions;
- never publishes originals, filenames, EXIF, GPS, faces, camera data, or credentials;
- validates JPEG/WebP bytes, limits previews to 10 MB, and skips unchanged assets;
- stages metadata before one atomic publication switch.

Every run writes only counts and timestamps to `data/status/media-publisher.json`; credentials, album IDs, filenames, and media paths are never written to status output.

Copy `media-publisher.example.env` to `C:\EmBe\secrets\runtime\media-publisher.env`, fill the Immich values, then set `EMBE_MEDIA_PUBLISHER_ENABLED=true`. Supabase settings are reused from the existing private portal sync file. Keep both files outside Git.

Run tests from this directory:

```powershell
$env:PYTHONPATH='.'
python -m unittest discover -s tests -v
```
