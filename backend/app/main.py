import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1 import (
    analytics,
    auth,
    bot,
    counters,
    cv,
    institutions,
    overview,
    personnel,
    predictions,
    public,
    queue,
    staff,
    tokens,
)
from app.config import settings
from app.websocket.routes import ws_router

app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)


@app.exception_handler(RequestValidationError)
async def private_validation_error(request, exc):
    # Pydantic's input/ctx can contain the entire intake, even on unrelated errors.
    return JSONResponse(status_code=422, content={"detail": [
        {"loc": error["loc"], "type": error["type"], "msg": "Invalid request value"}
        for error in exc.errors()
    ]})


@app.exception_handler(SQLAlchemyError)
async def private_database_error(request, exc):
    # PostgreSQL constraint DETAIL may contain a full row despite hide_parameters.
    logging.getLogger(__name__).error("Database operation failed (%s)", type(exc).__name__)
    return JSONResponse(status_code=500, content={"detail": "Database operation failed"})


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(bot.router, prefix=API_PREFIX)
app.include_router(institutions.router, prefix=API_PREFIX)
app.include_router(counters.router, prefix=API_PREFIX)
app.include_router(cv.router, prefix=API_PREFIX)
app.include_router(personnel.router, prefix=API_PREFIX)
app.include_router(tokens.router, prefix=API_PREFIX)
app.include_router(queue.router, prefix=API_PREFIX)
app.include_router(staff.router, prefix=API_PREFIX)
app.include_router(overview.router, prefix=API_PREFIX)
app.include_router(predictions.router, prefix=API_PREFIX)
app.include_router(analytics.router, prefix=API_PREFIX)
app.include_router(public.router, prefix=API_PREFIX)
app.include_router(ws_router)


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
