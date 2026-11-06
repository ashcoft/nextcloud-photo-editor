module.exports = {
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'vue'],
  transform: {
    '^.+\\.vue$': '@vue/vue3-jest',
    '.+\\.(css|styl|less|sass|scss|svg|png|jpg|ttf|woff|woff2)$': 'jest-transform-stub',
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
  transformIgnorePatterns: ['node_modules/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^.+\\.css$': 'jest-transform-stub',
    '^@nextcloud/router$': '<rootDir>/tests/__mocks__/@nextcloud/router.js',
    '^@nextcloud/files$': '<rootDir>/tests/__mocks__/@nextcloud/files.js',
    '^@nextcloud/axios$': '<rootDir>/tests/__mocks__/@nextcloud/axios.js',
    '^@nextcloud/l10n$': '<rootDir>/tests/__mocks__/@nextcloud/l10n.js',
  },
  testMatch: [
    '**/tests/unit/**/*.spec.(js|jsx|ts|tsx)',
    '**/tests/unit/**/*.test.(js|jsx|ts|tsx)',
    '**/src/**/*.test.(js|jsx|ts|tsx)',
    '**/__tests__/*.(js|jsx|ts|tsx)',
  ],
  testEnvironmentOptions: {
    url: 'http://localhost/',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,vue}',
    '!src/main.ts',
    '!src/**/*.test.ts',
    '!**/node_modules/**',
  ],
  globals: {
    OC: {},
    OCA: {},
    t: (app, text) => text,
    n: (app, singular) => singular,
  },
}
