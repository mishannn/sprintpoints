from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from .settings import get_settings


class Base(DeclarativeBase):
    pass


ALEMBIC_DIR = Path(__file__).resolve().parent.parent / "alembic"
# The oldest revision, representing the schema that existed before Alembic
# was introduced. Pre-Alembic databases are stamped here on first run.
BASELINE_REVISION = "0001_initial_schema"


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


def _alembic_config():
    from alembic.config import Config

    config = Config()
    config.set_main_option("script_location", str(ALEMBIC_DIR))
    # We build the Config in code (no .ini file), so skip fileConfig logging setup.
    config.attributes["configure_logger"] = False
    return config


def run_migrations() -> None:
    """Bring the database schema up to date, applying any pending migrations.

    Safe to run on every startup. Databases created before Alembic existed
    already hold the baseline schema but lack an alembic_version table, so
    they are stamped to the baseline first; only newer revisions then run.
    """
    from alembic import command

    engine = get_engine()
    with engine.connect() as connection:
        tables = set(inspect(connection).get_table_names())

    config = _alembic_config()
    if "alembic_version" not in tables and "rooms" in tables:
        command.stamp(config, BASELINE_REVISION)
    command.upgrade(config, "head")


@contextmanager
def db_session() -> Iterator[Session]:
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


def get_db() -> Iterator[Session]:
    with db_session() as db:
        yield db
