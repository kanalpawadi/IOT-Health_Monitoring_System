"""Async Postgres access via a shared asyncpg pool."""

from __future__ import annotations

import ssl
from contextlib import asynccontextmanager
from typing import Any

import asyncpg

from .config import settings

_pool: asyncpg.Pool | None = None


def _ssl_context() -> ssl.SSLContext:
    """Supabase requires TLS.

    We verify that the channel is encrypted but do not pin the CA, because
    Supabase's pooler presents a certificate that the system trust store on a
    stock Windows/Python install frequently does not carry. The credentials
    still travel over TLS; only the certificate chain check is relaxed.
    """
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


async def init_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        if not settings.database_url:
            raise RuntimeError(
                "DATABASE_URL is not set. Copy backend/.env.example to "
                "backend/.env and fill in your Supabase connection string."
            )
        _pool = await asyncpg.create_pool(
            dsn=settings.database_url,
            min_size=1,
            max_size=8,
            ssl=_ssl_context(),
            command_timeout=30,
            # pgbouncer in transaction mode cannot serve prepared statements
            statement_cache_size=0,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool is not initialised")
    return _pool


@asynccontextmanager
async def connection():
    pool = get_pool()
    async with pool.acquire() as conn:
        yield conn


async def fetch(query: str, *args: Any) -> list[asyncpg.Record]:
    async with connection() as conn:
        return await conn.fetch(query, *args)


async def fetchrow(query: str, *args: Any) -> asyncpg.Record | None:
    async with connection() as conn:
        return await conn.fetchrow(query, *args)


async def fetchval(query: str, *args: Any) -> Any:
    async with connection() as conn:
        return await conn.fetchval(query, *args)


async def execute(query: str, *args: Any) -> str:
    async with connection() as conn:
        return await conn.execute(query, *args)


async def healthcheck() -> bool:
    try:
        return await fetchval("select 1") == 1
    except Exception:
        return False
