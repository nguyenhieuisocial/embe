from __future__ import annotations

import hmac
from pathlib import Path
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from .contracts import Submission
from .repository import QueueConflict, QueueFull, Repository
from .worker import output_path


def create_app(root: Path, token: str) -> FastAPI:
    if len(token) < 32 or not token.isascii():
        raise ValueError("studio_requires_private_service_token")
    repository = Repository(root)

    def authorize(authorization: str = Header(default="")):
        if not hmac.compare_digest(authorization.encode(), ("Bearer " + token).encode()):
            raise HTTPException(401, "unauthorized")

    app = FastAPI(title="EmBe Studio private worker", docs_url=None, redoc_url=None, openapi_url=None, dependencies=[Depends(authorize)])

    @app.middleware("http")
    async def private_boundary(request: Request, call_next):
        # This service is for a trusted server adapter, not direct browser calls.
        if request.headers.get("origin") or request.headers.get("sec-fetch-site"):
            return JSONResponse({"error": "server_only"}, 403, headers={"cache-control": "no-store"})
        response = await call_next(request)
        response.headers["cache-control"] = "private, no-store"
        response.headers["x-content-type-options"] = "nosniff"
        return response

    @app.exception_handler(QueueConflict)
    async def conflict(_request, _error):
        return JSONResponse({"error": "idempotency_conflict"}, 409)

    @app.exception_handler(QueueFull)
    async def full(_request, _error):
        return JSONResponse({"error": "queue_full"}, 429, headers={"Retry-After": "60"})

    def require_job(identifier: str) -> dict:
        try:
            if str(UUID(identifier)) != identifier:
                raise ValueError()
        except ValueError:
            raise HTTPException(404, "not_found") from None
        job = repository.get(identifier)
        if not job:
            raise HTTPException(404, "not_found")
        return job

    @app.get("/health")
    def health():
        return {"status": "ok", "scope": "private-local", "rendering": "separate-worker", "tts": False, "publishing": False}

    @app.post("/jobs", status_code=202)
    async def submit(request: Request):
        # Enforce bytes while streaming, not after buffering an unbounded body.
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 16_384:
                raise HTTPException(413, "request_too_large")
        try:
            submission = Submission.model_validate_json(bytes(body))
        except ValueError:
            raise HTTPException(400, "invalid_project") from None
        return repository.submit(submission.idempotency_key, submission.project)

    @app.get("/jobs")
    def jobs():
        return {"jobs": repository.list()}

    @app.get("/jobs/{identifier}")
    def job(identifier: str):
        return require_job(identifier)

    @app.post("/jobs/{identifier}/cancel")
    def cancel(identifier: str):
        require_job(identifier)
        if not repository.cancel(identifier):
            raise HTTPException(409, "job_not_cancellable")
        return require_job(identifier)

    @app.post("/jobs/{identifier}/retry")
    def retry(identifier: str):
        require_job(identifier)
        if not repository.retry(identifier):
            raise HTTPException(409, "job_not_retryable")
        return require_job(identifier)

    @app.delete("/jobs/{identifier}", status_code=204)
    def delete(identifier: str):
        require_job(identifier)
        repository.delete(identifier)

    @app.get("/jobs/{identifier}/video")
    def video(identifier: str, download: bool = False):
        job = require_job(identifier)
        path = output_path(repository, identifier)
        if job["status"] != "completed" or not path.is_file():
            raise HTTPException(404, "video_not_ready")
        return FileResponse(path, media_type="video/mp4", filename=f"embe-{identifier}.mp4",
                            content_disposition_type="attachment" if download else "inline")

    return app
