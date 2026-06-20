from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import quote


@dataclass(frozen=True)
class Settings:
    database_url: str
    cors_origins: tuple[str, ...]


def _database_url() -> str:
    explicit_url = os.environ.get("DATABASE_URL")
    if explicit_url:
        return explicit_url

    postgres_db = os.environ.get("POSTGRES_DB")
    postgres_user = os.environ.get("POSTGRES_USER")
    postgres_password = os.environ.get("POSTGRES_PASSWORD")

    if postgres_db and postgres_user and postgres_password:
        postgres_host = os.environ.get("POSTGRES_HOST", "localhost")
        postgres_port = os.environ.get("POSTGRES_PORT", "5432")
        return (
            "postgresql+psycopg://"
            f"{quote(postgres_user, safe='')}:{quote(postgres_password, safe='')}"
            f"@{postgres_host}:{postgres_port}/{quote(postgres_db, safe='')}"
        )

    return "sqlite+pysqlite:///./planningpoker.sqlite3"


def _cors_origins() -> tuple[str, ...]:
    return tuple(
        origin.strip()
        for origin in os.environ.get("PLANNING_POKER_CORS_ORIGINS", "*").split(",")
        if origin.strip()
    )


def get_settings() -> Settings:
    return Settings(database_url=_database_url(), cors_origins=_cors_origins())
