/** @type {import('jest').Config} */
module.exports = {
  clearMocks: true,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: true, tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
};
