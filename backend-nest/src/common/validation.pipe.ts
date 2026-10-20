import { ValidationError, ValidationPipe } from "@nestjs/common";
import { unprocessable } from "./api-exception";

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: false,
    forbidNonWhitelisted: false,
    errorHttpStatusCode: 422,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) => unprocessable(formatValidationErrors(errors)),
  });
}

function formatValidationErrors(errors: ValidationError[]): string {
  const messages: string[] = [];
  collect(errors, "", messages);
  return messages.join("; ") || "invalid request body";
}

function collect(errors: ValidationError[], prefix: string, out: string[]): void {
  for (const error of errors) {
    const field = prefix ? `${prefix}.${error.property}` : error.property;
    if (error.constraints) {
      out.push(...Object.values(error.constraints).map((message) => `${field}: ${message}`));
    }
    if (error.children?.length) {
      collect(error.children, field, out);
    }
  }
}
