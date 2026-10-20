import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Request, Response } from "express";
import { ApiException } from "./api-exception";
import { isKnownPath, isKnownRoute } from "./routes";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    if (response.headersSent) {
      return;
    }

    if (exception instanceof ApiException) {
      response.status(exception.getStatus()).json({ detail: exception.detail });
      return;
    }

    if (isJsonSyntaxError(exception)) {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({ detail: exception.message });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const detail =
        typeof body === "string"
          ? body
          : typeof body === "object" && body !== null && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : typeof body === "object" && body !== null && "message" in body
              ? String((body as { message: unknown }).message)
              : exception.message;

      // Nest's body parser reports malformed JSON as a 400 before routing.
      // The API contract exposes all request binding failures as 422.
      if (status === HttpStatus.BAD_REQUEST) {
        response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({ detail });
        return;
      }

      if (status === HttpStatus.NOT_FOUND) {
        if (isKnownPath(request.path) && !isKnownRoute(request.method, request.path)) {
          response.status(HttpStatus.METHOD_NOT_ALLOWED).json({ detail: "Method Not Allowed" });
        } else {
          response.status(HttpStatus.NOT_FOUND).json({ detail: "Not Found" });
        }
        return;
      }
      response.status(status).json({ detail });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).type("text/plain").send("Internal Server Error");
  }
}

function isJsonSyntaxError(exception: unknown): exception is SyntaxError & { status?: number; statusCode?: number; type?: string } {
  if (typeof exception !== "object" || exception === null) {
    return false;
  }
  const error = exception as { status?: unknown; statusCode?: unknown; type?: unknown };
  return (
    error.type === "entity.parse.failed" ||
    ((error.status === 400 || error.statusCode === 400) && exception instanceof SyntaxError)
  );
}
