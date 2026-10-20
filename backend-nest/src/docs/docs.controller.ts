import { Controller, Get, Header, Res } from "@nestjs/common";
import { Response } from "express";
import { join } from "path";

const DOCUMENTS: Array<{ path: string; file: string; contentType: string }> = [
  { path: "openapi.json", file: "openapi.json", contentType: "application/json" },
  { path: "docs", file: "swagger.html", contentType: "text/html; charset=utf-8" },
  { path: "redoc", file: "redoc.html", contentType: "text/html; charset=utf-8" },
  { path: "docs/oauth2-redirect", file: "oauth2.html", contentType: "text/html; charset=utf-8" },
];

@Controller()
export class DocsController {
  @Get(["openapi.json", "docs", "redoc", "docs/oauth2-redirect"])
  serve(@Res() response: Response): void {
    const requestPath = response.req.path.replace(/^\/+/, "");
    const document = DOCUMENTS.find((item) => item.path === requestPath);
    if (!document) {
      response.status(404).json({ detail: "Not Found" });
      return;
    }
    response.type(document.contentType);
    response.sendFile(join(__dirname, document.file));
  }
}
