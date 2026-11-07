const coreRules = require('@commitlint/rules').default;
/*
 * Dependabot writes its own commit subject and there is no option to reword it:
 *
 *   chore(actions): Bump github/codeql-action/init from f3bbb056... to 33d7b85...
 *
 * That subject is start-case, so it fails `subject-case`, and because it
 * carries both full SHAs the header runs past 100 characters, so it also fails
 * `header-max-length`. Neither is something a contributor wrote, and neither
 * can be fixed from this repository.
 *
 * Only those two rules are relaxed, and only for the updater's own commits.
 * Everything else — the type, the scope, the body, the footer, the blank-line
 * rules — still applies, so a bump commit that is malformed in any other way is
 * still rejected. A blanket `ignores` entry would have skipped every rule.
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
