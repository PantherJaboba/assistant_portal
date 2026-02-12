from pathlib import Path
import os
import logging

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.templating import Jinja2Templates

from assistant_portal.app.routes import tasks, logs
from assistant_portal.infra.db.sqlite import make_sqlite_url, make_engine, make_sessionmaker
from assistant_portal.infra.db.task_repo_sqlite import Base, SQLiteTaskRepo
from assistant_portal.services.task_service import TaskService
from assistant_portal.observability.logging import setup_logging
from assistant_portal.app.middleware.access_log import AccessLogMiddleware
from assistant_portal.app.routes import logs_ws

BASE_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
logger = logging.getLogger("assistant.system")


def create_app() -> FastAPI:
    setup_logging()
    logger.info("system.start", extra={"category": "system", "event": "system.start"})

    app = FastAPI(title="Assistant Portal")
    app.add_middleware(AccessLogMiddleware)
    app.include_router(logs_ws.router)

    # Static files (CSS/JS)
    app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

    # --- SQLite wiring ---
    db_path = os.getenv("DB_PATH", "./data/assistant.db")
    sqlite_url = make_sqlite_url(db_path)
    engine = make_engine(sqlite_url)
    sessionmaker = make_sessionmaker(engine)

    repo = SQLiteTaskRepo(sessionmaker)
    svc = TaskService(repo)
    tasks.get_service = lambda: svc

    # Routers
    app.include_router(tasks.router)
    app.include_router(logs.router)

    # Create tables on startup
    @app.on_event("startup")
    async def _startup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info(
            "db.ready",
            extra={"category": "system", "event": "db.ready", "db_path": db_path},
        )

    # Pages
    @app.get("/", response_class=HTMLResponse)
    def home(request: Request):
        return templates.TemplateResponse("index.html", {"request": request})

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()