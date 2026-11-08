# Contributing to Photo Editor

Thank you for your interest in contributing to Photo Editor! This document provides guidelines and instructions for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/nextcloud-photo-editor.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Install dependencies: `pnpm install` and `composer install`
5. Make your changes
6. Run the checks: `make lint` and `make test`
7. Commit your changes: `git commit -m "feat: add your feature"`
8. Push to your fork: `git push origin feature/your-feature-name`
9. Open a Pull Request

## AI-Assisted Contributions

This project follows the [AI Contribution Policy](../AI_POLICY.md), which is the Nextcloud policy as it
applies to this app. Read that document before contributing with AI assistance. In short:

- Disclose AI use in the PR description, and add an `Assisted-by: AGENT_NAME:MODEL_VERSION` trailer to every commit containing AI-assisted content.
- You are the author of every line you submit. If you cannot explain why a change works the way it does, do not submit it.
- Write issues, PR descriptions and review comments in your own words.
- Verify dependencies, access control and security implications by hand.
- Clean up the output before submitting: no dead code, no duplicated logic, no comments that narrate the process.
- Test new features on a live Nextcloud instance, in every context the feature is reachable from.

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` A new feature
- `fix:` A bug fix
- `docs:` Documentation only changes
- `style:` Changes that do not affect the meaning of the code
- `refactor:` A code change that neither fixes a bug nor adds a feature
- `perf:` A code change that improves performance
- `test:` Adding missing tests or correcting existing tests
- `chore:` Changes to the build process or auxiliary tools

### Examples

```
feat: open PSD documents with 32-bit channels
fix: keep the merged image alpha channel when the header has four channels
docs: update installation instructions
refactor: move the channel split into the compositor
```

## Code Style

### PHP

- Follow PSR-12 coding standards
- Run `composer run cs:fix` before committing
- Run `composer run phpstan` and `composer run psalm`

### TypeScript and Vue

- Follow the ESLint configuration
- Run `pnpm run lint` and `pnpm run check-types` before committing
- Keep `src/editor/` framework-free: it is plain TypeScript that operates on canvases, and it must not import Vue

### CSS

- Follow the stylelint configuration
- Run `pnpm run stylelint` before committing

## Testing Requirements

- All new features must include tests
- Bug fixes should include regression tests
- Ensure all existing tests pass
- Test on PHP 8.4 and 8.5
- Test on Nextcloud 34 and 35
- Test on multiple databases (SQLite, MySQL, PostgreSQL)
- Test the app in a browser, not only in the unit tests

## Pull Request Process

1. **Title**: Use conventional commit format
2. **Description**: Clearly describe what changes were made and why
3. **Disclosure**: State whether AI tools were used, and how
4. **Testing**: Describe how you tested the changes
5. **Screenshots**: Include screenshots for UI changes
6. **Documentation**: Update documentation if needed

Keep each pull request focused on one thing. A description that does not match the diff is a sign the change was not reviewed before it was submitted.

## Review Process

- All PRs require at least one review
- Automated checks must pass
- Code must follow project standards
- Tests must pass on all supported platforms

## Reporting Security Issues

Do not report security vulnerabilities through public issues. Follow Nextcloud's [security policy](https://nextcloud.com/security/) and report via [HackerOne](https://hackerone.com/nextcloud).

## Questions?

Feel free to open an issue if you have any questions about contributing!
