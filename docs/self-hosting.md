# Self-hosting Dulli

This guide sets up Dulli at home or on a small server with **two containers**: the app and PostgreSQL.

## 1. Requirements

- A machine with Docker and the Compose plugin (a Raspberry Pi 4, a NAS or any VPS works).
- Optional: a domain name and a reverse proxy for HTTPS. A PWA needs HTTPS to be installable on phones outside your local network.

## 2. Install

```bash
git clone https://github.com/jdtrustgmbh/dulli.git && cd dulli
cp .env.example .env
```

Edit `.env`:

| Variable | Meaning |
| --- | --- |
| `POSTGRES_PASSWORD` | **Required.** Use `openssl rand -hex 24`. |
| `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD` | The first (owner) account. Empty password = random, printed once in the log. |
| `CREDENTIALS_KEY` | Key that encrypts calendar credentials at rest (`openssl rand -base64 32`). If empty a key file is created in the data volume. |
| `PUBLIC_HOST` | Your host name, e.g. `dulli.example.com`. |
| `DULLI_PORT` | Host port of the app (default 3000). |

Start it:

```bash
docker compose up -d --build
docker compose ps          # both containers should become "healthy"
docker compose logs app    # shows the generated password if you left it empty
```

Open `http://<your-host>:3000` and sign in with the bootstrap account. The owner account has every feature, including external calendars. Invite family members under **Settings -> Who has access?**; they join with a single-use link.

## Letting other families sign up

Set `SIGNUP_CODE` in `.env` to a long random string (`openssl rand -hex 16`) and restart. Then share `https://<your-host>/signup?code=<code>`. Everyone who opens the link can create an account and gets their **own household** (separate from yours) and the setup wizard. `SIGNUP_LIMIT` (default 25) caps the number of families. To stop signups, empty `SIGNUP_CODE` or change it; existing accounts keep working.

## 3. HTTPS with a reverse proxy

Example `Caddyfile` (Caddy gets and renews the certificate automatically):

```
dulli.example.com {
    reverse_proxy localhost:3000
}
```

Set `PUBLIC_HOST=dulli.example.com` in `.env` and run `docker compose up -d` again. Behind a proxy you can bind the app to localhost only by changing the port mapping in `docker-compose.yml` to `"127.0.0.1:3000:3000"`.

## 4. Google Calendar (optional)

1. In the Google Cloud Console create an OAuth client of type *Web application* and enable the Google Calendar API.
2. Add `https://dulli.example.com/api/providers/google/callback` as authorized redirect URI. For use beyond test users, Google asks for privacy-policy and terms URLs on the consent screen; Dulli does not provide them, link your own.
3. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` into `.env` and restart: `docker compose up -d`.

CalDAV (iCloud, Nextcloud, Fastmail, ...) and ICS links need no registration: connect them in the **More** view under calendar connections. Dulli only ever reads events.

## 5. Backup and restore

State lives in two volumes: `dulli-postgres` (all household data) and `dulli-data` (the generated `credentials.key` if you did not set `CREDENTIALS_KEY`).

```bash
# backup
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > dulli-backup.sql
# volume names are prefixed with the project (folder) name, see: docker volume ls
docker run --rm -v <project>_dulli-data:/data -v "$PWD":/backup alpine tar czf /backup/dulli-data.tar.gz -C /data .

# restore into an empty setup
docker compose up -d postgres
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < dulli-backup.sql
```

Keep your `CREDENTIALS_KEY` (or `credentials.key`) together with the backup: without it, stored calendar connections cannot be decrypted and must be connected again.

## 6. Upgrade

```bash
git pull
docker compose up -d --build
```

The schema is created and extended automatically on start.

## 7. Troubleshooting

- *App container restarts*: `docker compose logs app`. A missing `POSTGRES_PASSWORD` stops Compose before anything starts.
- *Forgot the owner password*: stop the stack, remove the account via the database or start with a fresh volume. There is no e-mail based password reset.
- *Health check*: `curl http://localhost:3000/api/health` returns `{"ok":true,...,"mode":"postgres"}`.
