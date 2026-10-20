import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * A domain error whose HTTP body matches the API contract: a status code and
 * a single human-readable `detail` string.
 */
export class ApiException extends HttpException {
  constructor(
    status: number,
    public readonly detail: string,
  ) {
    super({ detail }, status);
  }
}

export const badRequest = (detail: string) => new ApiException(HttpStatus.BAD_REQUEST, detail);
export const forbidden = (detail: string) => new ApiException(HttpStatus.FORBIDDEN, detail);
export const notFound = (detail: string) => new ApiException(HttpStatus.NOT_FOUND, detail);
export const serviceUnavailable = (detail: string) => new ApiException(HttpStatus.SERVICE_UNAVAILABLE, detail);
export const unprocessable = (detail: string) => new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, detail);
