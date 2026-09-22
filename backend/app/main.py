"""AI-Enabled IoT-Based Remote Patient Health Monitoring System -- API.

Run with:  uvicorn app.main:app --reload --port 8000
Docs at :  http://localhost:8000/docs
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .config import settings
from .routers import alerts, ingest, insights, monitoring, reports


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_pool()
    try:
        yield
    finally:
        await db.close_pool()


app = FastAPI(
    title="AI-Enabled IoT Remote Patient Health Monitoring",
    description=(
        "Rule/trend engine, fall detection and a Generative AI explanation "
        "layer over ESP8266 vitals stored in Supabase. Monitoring assistance "
        "only -- not a medical diagnostic device."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(monitoring.router)
app.include_router(alerts.router)
app.include_router(insights.router)
app.include_router(reports.router)
app.include_router(ingest.router)


@app.get("/api/health", tags=["meta"])
async def health():
    return {
        "status": "ok",
        "database": "connected" if await db.healthcheck() else "unreachable",
        "generative_ai": "groq" if settings.groq_api_key else "fallback-template",
        "model": settings.groq_model if settings.groq_api_key else None,
    }


@app.get("/", tags=["meta"])
async def root():
    return {
        "name": "AI-Enabled IoT Remote Patient Health Monitoring API",
        "docs": "/docs",
        "health": "/api/health",
    }
