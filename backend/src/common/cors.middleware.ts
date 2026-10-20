import { NextFunction, Request, Response } from "express";

/**
 * Matches the browser-origin behavior of the previous service: configured
 * origins are echoed, `*` is allowed, and a denied preflight returns 403.
 */
export function corsMiddleware(origins: string[]) {
  const allowAny = origins.includes("*");
  return (request: Request, response: Response, next: NextFunction): void => {
    const origin = request.headers.origin;
    if (!origin) {
      next();
      return;
    }

    if (!allowAny && !origins.includes(origin)) {
      if (request.method === "OPTIONS") {
        response.status(403).end();
        return;
      }
      next();
      return;
    }

    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Origin", allowAny ? "*" : origin);
    if (request.method === "OPTIONS") {
      response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Origin,Content-Type,X-Host-Token,X-Participant-Token");
      response.setHeader("Access-Control-Max-Age", "600");
      response.status(204).end();
      return;
    }
    next();
  };
}
