# Contributing to Dulli

Thanks for helping! Bug reports, translations and pull requests are welcome.

## Setup

```bash
npm ci
npx playwright install chromium
npm start                 # http://localhost:3000, first login is printed in the console
```

## Before you open a pull request

- `npm run check && npm run verify` must pass; run `npm run test:all` (or the relevant `npm run test:<area>`) when you touch the matching area.
- Add or extend a smoke test for behavior changes. Tests live in `tests/` as `*.test.mjs` and run against a throw-away local server (register a new one as `test:<name>` in `package.json`).
- Keep the app framework-free and keep user-facing text translatable: English strings in the source, German in the dictionaries (`public/js/i18n-ui.js` and the per-module dictionaries). The public pages (login, invitation) are translated in `public/js/public-i18n.js`.
- Bump the service-worker cache name in `public/sw.js` when you change files that are served to browsers.
- Add a line to the `[Unreleased]` section of [CHANGELOG.md](CHANGELOG.md) for user-visible changes.
- Never commit secrets, real household data or personal information. Use fictional sample data in tests and screenshots.

## License

By contributing you agree that your contribution is licensed under the project's license, [AGPL-3.0-only](LICENSE).
