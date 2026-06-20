from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import configure_database, init_db
from .routers import health, issues, participants, rooms, votes
from .settings import Settings, get_settings


def create_app(settings: Settings | None = None, database_url: str | None = None) -> FastAPI:
    app_settings = settings or get_settings()
    configure_database(database_url or app_settings.database_url)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        init_db()
        yield

    app = FastAPI(title="Sprint Points API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(app_settings.cors_origins),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(rooms.router)
    app.include_router(participants.router)
    app.include_router(issues.router)
    app.include_router(votes.router)
    return app


app = create_app()
