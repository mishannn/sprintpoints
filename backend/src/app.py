"""FastAPI application: middleware, error handlers and route wiring."""

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from config import ALLOWED_HEADERS, ALLOWED_METHODS, setting
from errors import ApiError
from routes import api

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def middleware(request: Request, call_next):
    path = request.url.path
    if len(path) > 1 and path.endswith("/"):
        status = 301 if request.method in ("GET", "HEAD") else 307
        return RedirectResponse(str(request.url.replace(path=path.rstrip("/"))), status)

    origin = request.headers.get("origin")
    if not origin:
        return await call_next(request)

    configured = setting(request, "CORS_ORIGINS", "*")
    origins = [item.strip() for item in str(configured or "").split(",") if item.strip()]
    allow_any = "*" in origins
    allowed = allow_any or origin in origins

    if request.method == "OPTIONS":
        if not allowed:
            return Response(status_code=403)
        return Response(
            status_code=204,
            headers={
                "vary": "Origin",
                "access-control-allow-origin": "*" if allow_any else origin,
                "access-control-allow-methods": ALLOWED_METHODS,
                "access-control-allow-headers": ALLOWED_HEADERS,
                "access-control-max-age": "600",
            },
        )

    if not allowed:
        return await call_next(request)

    response = await call_next(request)
    response.headers["vary"] = "Origin"
    response.headers["access-control-allow-origin"] = "*" if allow_any else origin
    return response


@app.exception_handler(ApiError)
async def api_error_handler(request: Request, error: ApiError):
    return JSONResponse({"detail": error.detail}, status_code=error.status)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, error: RequestValidationError):
    if any(item.get("type") == "json_invalid" for item in error.errors()):
        return JSONResponse({"detail": "invalid request body"}, status_code=422)
    details = []
    for item in error.errors():
        location = ".".join(str(part) for part in item["loc"] if part != "body")
        details.append(f"{location}: {item['msg']}" if location else item["msg"])
    return JSONResponse(
        {"detail": "; ".join(details) or "invalid request body"}, status_code=422
    )


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(request: Request, error: StarletteHTTPException):
    return JSONResponse(
        {"detail": error.detail}, status_code=error.status_code, headers=error.headers
    )


app.include_router(api)
