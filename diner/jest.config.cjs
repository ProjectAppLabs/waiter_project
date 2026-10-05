const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

/** @type {import('jest').Config} */
const customJestConfig = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Con la máquina cargada (otras suites o servidores a la vez) 5 s por prueba se quedaba corto y fallaban pruebas sanas.
  testTimeout: 15000,
  // La mitad de los núcleos: con todos, las suites se ahogaban entre ellas cuando la máquina ya tenía carga.
  maxWorkers: '50%',
  testMatch: ['<rootDir>/**/__tests__/**/*.test.(ts|tsx)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!**/e2e/**',
    '!app/layout.tsx',
    '!app/globals.css',
    '!lib/types.ts',
  ],
  coverageProvider: 'v8',
  coverageThreshold: {
    // Trinquete (2026-10-04): un par de puntos por debajo de lo medido, para que la cobertura no baje sin avisar.
    // Súbelos cuando la cobertura mejore (skill /cobertura).
    global: {
      branches: 86,
      functions: 82,
      lines: 96,
      statements: 96,
    },
  },
  coverageReporters: ['text-summary', 'text', 'lcov', 'html', 'json-summary'],
};

module.exports = createJestConfig(customJestConfig);
