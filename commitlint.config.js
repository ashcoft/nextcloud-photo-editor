const coreRules = require('@commitlint/rules').default
/*
 * Dependabot's generated subject is start-case and, carrying both full SHAs, runs
 * past 100 characters. Neither can be reworded from here, so `subject-case` and
 * `header-max-length` are relaxed for the updater's commits only; every other rule
 * still applies, so a bump commit malformed in any other way is still rejected.
 */
const BOT_COMMIT = /^chore\((deps|actions)\): Bump /;

const relaxedForBots = (rule) => (parsed, when, value) =>
  BOT_COMMIT.test(parsed.header || '') ? [true] : rule(parsed, when, value);

module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'subject-case': relaxedForBots(coreRules['subject-case']),
        'header-max-length': relaxedForBots(coreRules['header-max-length']),
      },
    },
  ],
  rules: {
    'type-enum': [2, 'always', [
      'feat',
      'fix',
      'docs',
      'style',
      'refactor',
      'perf',
      'test',
      'chore',
      'ci',
      'build',
      'revert'
    ]],
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'header-max-length': [2, 'always', 100]
  }
};
