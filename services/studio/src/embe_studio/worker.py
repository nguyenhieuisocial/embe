from __future__ import annotations

import os
import shutil
from contextlib import contextmanager
from pathlib import Path
from uuid import UUID

from .assets import AssetSource, AssetUnavailable
from .render import RenderCancelled, render
from .repository import Repository


@contextmanager
def worker_lock(root: Path):
    """OS lock is released on crash; no PID guessing and no stale lock-file deletion."""
    with (root / "worker.lock").open("a+b") as handle:
        if os.name == "nt":
            import msvcrt
            if handle.tell() == 0:
                handle.write(b"0")
                handle.flush()
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if os.name == "nt":
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def output_path(repository: Repository, identifier: str, *, partial: bool = False) -> Path:
    if str(UUID(identifier)) != identifier:
        raise ValueError("invalid_job_id")
    directory = repository.root / ("work" if partial else "outputs")
    directory.mkdir(exist_ok=True)
    target = directory / f"{identifier}.mp4"
    if not target.resolve().is_relative_to(repository.root) or target.is_symlink():
        raise ValueError("unsafe_output_path")
    return target


def collect_garbage(repository: Repository):
    for identifier in repository.garbage_ids():
        # Only exact generated files, never originals or recursive directories.
        output_path(repository, identifier).unlink(missing_ok=True)
        output_path(repository, identifier, partial=True).unlink(missing_ok=True)


def run_once(repository: Repository, source: AssetSource, *, font_path: Path | None = None) -> dict:
    with worker_lock(repository.root):
        repository.recover()
        collect_garbage(repository)
        # A stopped worker may have left only its own partial output.
        for partial in (repository.root / "work").glob("*.mp4"):
            try:
                exact = output_path(repository, partial.stem, partial=True)
            except ValueError:
                continue
            exact.unlink(missing_ok=True)
        job = repository.claim()
        if not job:
            return {"status": "idle"}
        identifier = job["id"]
        partial = output_path(repository, identifier, partial=True)
        final = output_path(repository, identifier)
        try:
            if shutil.disk_usage(repository.root).free < 512_000_000:
                raise RuntimeError("disk_headroom_low")
            result = render(job["project"], source, partial, lambda value: repository.progress(identifier, value), font_path=font_path)
            partial.replace(final)
            if not repository.complete(identifier, result):
                final.unlink(missing_ok=True)
                return {"id": identifier, "status": "cancelled"}
            return {"id": identifier, "status": "completed", "result": result}
        except RenderCancelled:
            return {"id": identifier, "status": "cancelled"}
        except AssetUnavailable:
            repository.fail(identifier, "asset_unavailable", retryable=True)
        except ValueError:
            repository.fail(identifier, "invalid_image")
        except Exception:
            repository.fail(identifier, "render_failed")
        finally:
            partial.unlink(missing_ok=True)
        return {"id": identifier, "status": repository.get(identifier)["status"] if repository.get(identifier) else "deleted"}
