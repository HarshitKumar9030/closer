# Deployment

The supported deployment is one Node process, MongoDB 8 and an HTTPS reverse proxy. MongoDB Atlas can replace the local database. The application has one runtime npm dependency: the official MongoDB driver.

## Docker Compose

1. Point your domain's DNS at the server. Allow ports 80 and 443.
2. Run `npm ci && npm run setup` to create an ignored, mode-0600 `.env` with separate random owner, app database and root database secrets.
3. Set `CLOSER_DOMAIN` in `.env`.
4. Run `docker compose config --quiet`, then `docker compose up -d --build`.
5. Check `https://YOUR_DOMAIN/readyz`, create a pairing code in Sharing, and connect the phone.

The app container runs as a non-root user. MongoDB has no host port mapping. Its application account is limited to `readWrite` on the `closer` database; only the MongoDB container receives root credentials. The first-start init script creates the app account. Changing `.env` passwords later does not change users already stored in the database; rotate those credentials through MongoDB as well.

`/healthz` checks the process. `/readyz` checks the database and returns 503 when it is unavailable. The container health check uses `/readyz`. The app rejects production startup without an explicit MongoDB URI and an owner key of at least 32 characters.

Use the owner key only in the owner's dashboard. Do not put it in a link, client bundle or public issue. Viewer and writer keys are separate; only their SHA-256 hashes are stored in MongoDB. Viewer tokens cannot mutate records. Expired pairing codes and rate-limit buckets use TTL indexes; history and sessions do not.

## Backups

Keep encrypted, off-server backups. This command writes a compressed archive to the host without printing the database password:

```sh
docker compose exec -T mongo sh -c 'exec mongodump --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db closer --archive --gzip' > closer-backup.archive.gz
```

Test restores into a separate database or instance before relying on a backup. The archive contains private activity and token hashes. Restrict its permissions and encrypt it. A backup restores data only up to its capture time; deleted history may remain in older backups until you expire them.

## Upgrades

Back up the database, pull the new source, then run `docker compose up -d --build`. Check readiness and a phone sync. Index setup is idempotent. Keep the MongoDB volume; never run `docker compose down --volumes` as an upgrade step.

For reproducible releases, pin container images to verified digests after testing them on your server architecture. Review dependency and base-image updates regularly.

## Without Docker

Set `OWNER_KEY`, `MONGODB_URI`, `MONGODB_DATABASE`, `HOST` and `PORT` in the server's environment. Install with `npm ci --omit=dev`, run `npm start` under your process supervisor, and put an HTTPS reverse proxy in front of it. Keep MongoDB private and authenticated. Do not expose the raw app port as an unauthenticated alternative to HTTPS.

The included server serializes mutations per device in one process. Multiple app replicas need shared mutation coordination or MongoDB transactions before horizontal scaling.

## Migrate from SQLite

Stop the old server. Configure the destination MongoDB database, then run:

```sh
npm run migrate:sqlite -- data/closer.db
```

The importer preserves device IDs, writer/viewer hashes, icons and stored daily history. It inserts only missing records, leaves newer MongoDB records unchanged, and does not modify the SQLite source. Verify the imported counts and one paired-device sync before retiring the old database. Unused pairing codes are not migrated; create new ones. Previously deleted history cannot be recovered.
