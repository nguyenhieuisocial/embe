from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Scene(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    asset_id: str
    caption: str = Field(default="", max_length=120)
    seconds: int = Field(default=4, ge=2, le=8)

    @field_validator("asset_id")
    @classmethod
    def validate_id(cls, value: str) -> str:
        if str(UUID(value)) != value.lower():
            raise ValueError("invalid_asset_id")
        return value.lower()

    @field_validator("caption")
    @classmethod
    def clean_caption(cls, value: str) -> str:
        # Captions are rasterized as text, never interpreted as markup/commands.
        return " ".join(value.split())


class Project(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    version: Literal[1] = 1
    format: Literal["portrait", "landscape", "square"] = "portrait"
    quality: Literal["preview", "full"] = "preview"
    motion: bool = True
    scenes: list[Scene] = Field(min_length=1, max_length=12)


class Submission(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    idempotency_key: str
    project: Project

    @field_validator("idempotency_key")
    @classmethod
    def validate_key(cls, value: str) -> str:
        if str(UUID(value)) != value.lower():
            raise ValueError("invalid_idempotency_key")
        return value.lower()


def dimensions(project: Project) -> tuple[int, int]:
    full = {"portrait": (1080, 1920), "landscape": (1920, 1080), "square": (1080, 1080)}
    preview = {"portrait": (360, 640), "landscape": (640, 360), "square": (360, 360)}
    return (full if project.quality == "full" else preview)[project.format]
