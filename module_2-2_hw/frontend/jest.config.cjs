/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "\\.(css|less|scss)$": "<rootDir>/__mocks__/styleMock.js",
  },
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};
