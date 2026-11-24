from __future__ import annotations

from contextlib import asynccontextmanager
import logging
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from .routers import designs, floorplans, health, projects, renders, scenes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("aussiehome.api")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    logger.info(
        "AussieHome 3D API started (env=%s, ai_mode=%s)",
        settings.app_env,
        "gemini" if settings.has_gemini_key else "assisted_demo",
    )
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Australian AI 3D Home Design & Renovation Platform REST API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    logger.info("%s %s -> %d (%.1f ms)", request.method, request.url.path, response.status_code, elapsed_ms)
    return response


API_PREFIX = "/api/v1"
app.include_router(health.router, prefix=API_PREFIX)
app.include_router(projects.router, prefix=API_PREFIX)
app.include_router(floorplans.router, prefix=API_PREFIX)
app.include_router(scenes.router, prefix=API_PREFIX)
app.include_router(designs.router, prefix=API_PREFIX)
app.include_router(renders.router, prefix=API_PREFIX)
