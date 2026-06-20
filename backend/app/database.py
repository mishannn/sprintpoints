from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from .settings import get_settings


class Base(DeclarativeBase):
    pass


engine: Engine | None = None
SessionLocal: sessionmaker[Session] | None = None


def configure_database(database_url: str | None = None) -> Engine:
    global engine, SessionLocal

    url = database_url or get_settings().database_url
    connect_args = {}
    poolclass = None

    if url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
        if url.endswith(":memory:"):
            poolclass = StaticPool

    engine_kwargs = {
        "connect_args": connect_args,
        "pool_pre_ping": True,
        "future": True,
    }
    if poolclass is not None:
        engine_kwargs["poolclass"] = poolclass

    engine = create_engine(url, **engine_kwargs)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
    return engine


def get_engine() -> Engine:
    return engine or configure_database()


def init_db() -> None:
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=get_engine())


def get_db() -> Iterator[Session]:
    if SessionLocal is None:
        configure_database()

    assert SessionLocal is not None
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
