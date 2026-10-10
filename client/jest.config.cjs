/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest', {
      jsc: {
        parser: { syntax: 'typescript', tsx: true },
        transform: { react: { runtime: 'automatic' } },
        target: 'es2022',
      },
      module: { type: 'commonjs' },
    }],
  },
  // react-markdown and its unified/remark/micromark dependencies ship as ES modules only: transform them too
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?(?:react-markdown|remark-[^/]+|mdast-[^/]+|micromark[^/]*|unified|unist-[^/]+|hast-[^/]+|vfile[^/]*|bail|trough|devlop|is-plain-obj|decode-named-character-reference|character-entities[^/]*|property-information|space-separated-tokens|comma-separated-tokens|html-url-attributes|estree-util-[^/]+|ccount|markdown-table|zwitch|longest-streak|trim-lines|stringify-entities|style-to-js|style-to-object|inline-style-parser|parse-entities|escape-string-regexp)/)',
  ],
  moduleNameMapper: {
    '^virtual:pwa-register/react$': '<rootDir>/test/pwa-register-react.stub.ts',
    '^@/config$': '<rootDir>/test/config.stub.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss)$': 'identity-obj-proxy',
  },
  clearMocks: true,
};
