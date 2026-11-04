# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private vulnerability reporting ("Security" tab of the repository -> "Report a vulnerability"). Include the affected version or commit, steps to reproduce and the impact you see. We aim to acknowledge reports within a few days.

## Scope notes for operators

- Run Dulli behind HTTPS. Session cookies and calendar credentials must not travel over plain HTTP outside a trusted local network.
- Calendar credentials (Google tokens, CalDAV passwords, secret ICS links) are encrypted at rest with `CREDENTIALS_KEY`. Keep the key and your database backups separate and private.
- Change the bootstrap password after the first login and never commit your `.env` file.
