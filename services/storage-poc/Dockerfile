FROM python:3.13-slim@sha256:7ce4b6dfe35e55397b7cda544f8a13f191b7ae28dc5aad71fe664dbc9bc2623f

WORKDIR /app
COPY pyproject.toml README.md /app/
COPY src /app/src
COPY migrations /app/migrations
RUN python -m pip install --no-cache-dir .
RUN useradd --create-home --uid 10001 appuser

ENV PYTHONUNBUFFERED=1
EXPOSE 8099
USER appuser
CMD ["python", "-m", "uvicorn", "embe_storage.api:app", "--host", "0.0.0.0", "--port", "8099"]
