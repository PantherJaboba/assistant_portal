from __future__ import annotations
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from pathlib import Path

def make_sqlite_url(db_path: str) -> str:
    # db_path like "./data/assistant.db"
    p = Path(db_path).resolve()
    p.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite+aiosqlite:///{p.as_posix()}"

def make_engine(sqlite_url: str):
    return create_async_engine(sqlite_url, future=True)

def make_sessionmaker(engine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)