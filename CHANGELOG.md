# Changelog

All notable changes to Dulli are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

- Added: signup link. Set `SIGNUP_CODE` and share `/signup?code=...`: every family that uses it gets its own household and the setup wizard (`SIGNUP_LIMIT` caps the number of families).

## [1.0.0] - 2026-11-04

First public release.

### Added

- **Calendar:** month, week, 5-day, day and per-person ("profiles") views; recurring events with weekday selection, reminders, public holidays by region and moon phases. Events for everyone span all profile columns.
- **External calendars (read-only):** Google Calendar, CalDAV (iCloud, Nextcloud, Fastmail, ...) and ICS links. Each connected calendar can belong to a person or to everyone, and can be marked private (only "busy" blocks are shown).
- **Encrypted credentials:** Google tokens, CalDAV passwords and secret ICS links are encrypted at rest (AES-256-GCM) with `CREDENTIALS_KEY`.
- **Tasks and rewards:** per-person task boards with daily and weekly routines, task presets and "recently used" suggestions, coins for completed tasks and treasure chests to spend them on. Profile badges count what is due today and turn into a check mark when everything is done.
- **Meals and lists:** weekly meal plan with a recipe box (emojis, photos, repeat), ingredients flow into the shopping list; any number of shared lists with an offline queue.
- **Wall display and photo frame:** shared display mode, picture mode with uploaded photos, quiet hours and a PIN-protected child lock.
- **Households:** invite family members with single-use links, profiles with colors and photos, data export, account deletion, sign-out on all devices.
- **Onboarding:** a setup wizard that only appears for households that are not set up yet.
- **Look and feel:** night mode, English and German user interface, installable PWA with offline shell, layout for phones, tablets, desktops and safe areas on iPhone and iPad.
- **Self-hosting:** `docker compose` setup with two containers (app and PostgreSQL), documented in [docs/self-hosting.md](docs/self-hosting.md).
- **Quality:** 24 groups of automated browser and HTTP tests (`npm run test:all`), GitHub Actions CI that also builds and starts the two containers.

### Changed

- Repository layout reorganized into `server/`, `public/`, `tests/`, `scripts/` and `docs/` (see [docs/architecture.md](docs/architecture.md)).

[Unreleased]: https://github.com/jdtrustgmbh/dulli/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/jdtrustgmbh/dulli/releases/tag/v1.0.0
