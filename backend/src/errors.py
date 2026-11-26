"""Domain errors returned as `{"detail": "..."}`."""


class ApiError(Exception):
    def __init__(self, status: int, detail: str):
        self.status = status
        self.detail = detail


def not_found(detail: str) -> ApiError:
    return ApiError(404, detail)


def forbidden(detail: str) -> ApiError:
    return ApiError(403, detail)
