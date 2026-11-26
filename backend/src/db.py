"""D1 engine/session wiring for FastAPI."""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateIndex, CreateTable

from models import Base

_engine = None


async def get_session(request: Request) -> AsyncIterator[Session]:
    global _engine
    if _engine is None:
        from sqlalchemy_cloudflare_d1 import create_engine_from_binding

        _engine = create_engine_from_binding(request.scope["env"].DB)
        with _engine.begin() as connection:
            for table in Base.metadata.sorted_tables:
                connection.execute(CreateTable(table, if_not_exists=True))
                for index in table.indexes:
                    connection.execute(CreateIndex(index, if_not_exists=True))
    with Session(_engine, expire_on_commit=False) as session:
        yield session


Db = Annotated[Session, Depends(get_session)]
