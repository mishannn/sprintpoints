/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: "test/postgres/.*\\.spec\\.ts$",
  setupFiles: ["<rootDir>/test/postgres/setup-env.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  testEnvironment: "node",
  testTimeout: 60000,
};
