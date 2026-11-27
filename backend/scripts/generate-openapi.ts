import { writeFile } from "node:fs/promises";
import { generateSpecs } from "hono-openapi";
import { createApp } from "../src/app";
import { openApiDocumentation } from "../src/openapi";

const app = createApp(null as never, () => {});
const spec = await generateSpecs(app, {
  documentation: openApiDocumentation,
  defaultValidationErrorResponse: false,
});

await writeFile(new URL("../openapi.json", import.meta.url), `${JSON.stringify(spec, null, 2)}\n`);
console.log("Wrote backend/openapi.json");
