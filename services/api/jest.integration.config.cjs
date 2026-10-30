/**
 * End-to-end API tests against a real MongoDB (see src/__integration__/setupEnv.ts).
 * Run with `pnpm test:integration`; each test file gets its own throwaway database.
 */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__integration__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['@swc/jest', { jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' } }],
  },
  // Source files import siblings with the NodeNext ".js" suffix
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  setupFiles: ['<rootDir>/src/__integration__/setupEnv.ts'],
  testTimeout: 60000,
  maxWorkers: 1,
};
