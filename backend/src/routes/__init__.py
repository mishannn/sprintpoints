"""API router assembly."""

from fastapi import APIRouter

from . import admin, issues, participants, rooms, votes

api = APIRouter(prefix="/api")


@api.get("/health")
async def health():
    return {"status": "ok"}


for module in (rooms, participants, issues, votes, admin):
    api.include_router(module.router)
