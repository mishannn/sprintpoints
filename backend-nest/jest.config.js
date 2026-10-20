/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: "test/.*\\.spec\\.ts$",
  testPathIgnorePatterns: ["/test/postgres/"],
  setupFiles: ["<rootDir>/test/setup-env.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  testEnvironment: "node",
  testTimeout: 30000,
};
