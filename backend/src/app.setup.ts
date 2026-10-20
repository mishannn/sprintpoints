import { INestApplication } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { corsMiddleware } from "./common/cors.middleware";
import { createValidationPipe } from "./common/validation.pipe";

export function configureApp(app: INestApplication, origins: string[]): void {
  app.getHttpAdapter().getInstance().set("case sensitive routing", true);
  app.use(corsMiddleware(origins));
  app.use(trailingSlashRedirect);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
}

/** Keep the legacy trailing-slash redirect behavior for existing clients. */
function trailingSlashRedirect(request: Request, response: Response, next: NextFunction): void {
  if (request.path.length > 1 && request.path.endsWith("/")) {
    const queryIndex = request.originalUrl.indexOf("?");
    const query = queryIndex >= 0 ? request.originalUrl.slice(queryIndex) : "";
    const path = request.originalUrl.slice(0, queryIndex >= 0 ? queryIndex : undefined).replace(/\/+$/, "");
    response.redirect(request.method === "GET" || request.method === "HEAD" ? 301 : 307, `${path}${query}`);
    return;
  }
  next();
}

export function corsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = env.PLANNING_POKER_CORS_ORIGINS;
  if (configured === undefined) {
    return ["*"];
  }
  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
