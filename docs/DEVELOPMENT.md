# Development

## Stack

- `android/`: native Java, Android 10+, no third-party runtime dependencies.
- `site/src/`: HTML, CSS and vanilla JavaScript. Lucide vectors and sample app icons are bundled locally.
- `server/`: one Node HTTP service and the official MongoDB driver.
- `scripts/`: setup, icon generation and the optional SQLite importer.

No frontend build server or framework is needed for local development. `npm run dev` reads web files directly; reload the browser after edits. Restart Node after server changes.

## Test database

Run a separate local MongoDB instance:

```sh
mkdir -p artifacts/test-mongo
mongod --dbpath ./artifacts/test-mongo --bind_ip 127.0.0.1 --port 27028
```

In a second terminal:

```sh
TEST_MONGODB_URI=mongodb://127.0.0.1:27028 npm test
npm run build:web
node site/scripts/validate-artifact.mjs
```

Tests create randomly named databases and remove only those databases after completion. Never point `TEST_MONGODB_URI` at a production deployment. Tests cover retained history beyond 400 days, cursor pagination, sessions without invented offline activity, exports, pairing, authentication, icon validation, pause, token rotation and deletion. The private-preview compatibility adapter is tested separately from production MongoDB.

## Android

Set `ANDROID_HOME` and `JAVA_HOME` if the SDK/JDK is not in the default Android Studio location. Run `npm run build:android`. Build tools and API 36+ are required. The build scripts target macOS and Linux; use the CI APK artifact on other hosts. Build outputs and debug signing keys are ignored.

The usage reducer can be tested without a device:

```sh
mkdir -p artifacts/usage-tests
javac -d artifacts/usage-tests android/src/app/closer/phone/UsageAccumulator.java tests/UsageAccumulatorTest.java
java -cp artifacts/usage-tests UsageAccumulatorTest
```

With an already booted test emulator, `npm run test:android-icons` builds a test-only instrumentation APK and verifies actual installed drawable extraction, 64x64 PNG encoding, and upload acknowledgement. It does not grant Usage Access or collect unrelated phone content.

Run `node scripts/sync-ui-icons.mjs` and `python3 scripts/sync-android-icons.py` after changing the selected Lucide icons. The generator outputs are checked in; production needs no icon-library runtime. Respect `prefers-reduced-motion` and Android animator settings.

## Hosted preview

The optional Sites builder emits a single Worker with embedded assets. Local preview identity lives in the ignored `site/.openai/hosting.json`; a clean clone builds from `hosting.example.json`. The preview remains private and is not a live phone-ingestion endpoint. The self-hosted Node server uses MongoDB exclusively.
