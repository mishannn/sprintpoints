import { registerDecorator, ValidationArguments, ValidationOptions } from "class-validator";

/**
 * Requires the property to be present in the request body and to be either a
 * string or explicit null. This preserves Go's `json.RawMessage` behavior for
 * fields such as active story IDs while rejecting missing keys.
 */
export function IsPresentNullableString(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: "isPresentNullableString",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, arguments_: ValidationArguments): boolean {
          const source = arguments_.object as Record<string, unknown>;
          if (!Object.prototype.hasOwnProperty.call(source, propertyName)) {
            return false;
          }
          return value === null || typeof value === "string";
        },
        defaultMessage(arguments_: ValidationArguments): string {
          return `${arguments_.property} must be present and be a string or null`;
        },
      },
    });
  };
}
