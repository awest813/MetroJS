module.exports = {
  collectCoverage: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "test/**/*.ts",
  ],
  coverageReporters: ["json", "lcov", "text", "html"],
  moduleFileExtensions: [
    "ts",
    "js",
  ],
  roots: [
    "<rootDir>/src",
    "<rootDir>/test",
  ],
  testEnvironment: "node",
  testMatch: ["**/test/*.ts", "**/test/**/*.ts"],
  // Shared helpers for the tests, not tests themselves.
  testPathIgnorePatterns: ["/node_modules/", "/test/support/"],
  transform: {
    // Tests run on Node, which has ES2020: compile them to it rather than the
    // build's ES5, whose downlevelled iterators make the sim loops ~10× slower.
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.jest.json" }]
  },
  moduleNameMapper: {
    "^simplex-noise$": "<rootDir>/openpublica/node_modules/simplex-noise/dist/cjs/simplex-noise.js",
    "^alea$": "<rootDir>/openpublica/node_modules/alea/alea.js",
  },
};
