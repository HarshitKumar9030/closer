# Releases

## Android signing

The default APK is a development build. Do not publish it as a signed production release.

Create and back up your own permanent signing keystore outside the repository:

```sh
keytool -genkeypair -keystore /secure/path/closer-release.keystore -alias closer -keyalg RSA -keysize 3072 -validity 10000
```

Set these variables through your local shell or secret manager, then build:

```sh
export ANDROID_KEYSTORE=/secure/path/closer-release.keystore
export ANDROID_KEY_ALIAS=closer
# Set ANDROID_KEYSTORE_PASSWORD securely; optionally set ANDROID_KEY_PASSWORD.
npm run build:android:release
```

Passwords are passed to `apksigner` through environment references, not command-line values or tracked files. The builder verifies the signature and emits `android/build/closer-release.apk`. Keep the keystore and recovery information backed up; losing them can prevent updates to installed apps. A release key differs from the development key, so Android may require uninstalling a development build first.

## Release checks

- CI passes, including the production-container smoke test.
- The APK installs and updates on a physical target phone.
- Usage Access, notification permission, foreground app changes, screen-off time and unlocks behave correctly on that phone.
- Pause, link revocation and deletion work from both phone and dashboard.
- Reconnection, battery optimization, Doze, restart and force-stop behavior are tested.
- Backups have been restored successfully into an isolated instance.
- Production secrets, HTTPS, database network access and available storage are verified.
- The version name/code in `android/AndroidManifest.xml` is incremented for an update.

Google Play distribution requires review of the `specialUse` foreground service and applicable permissions. Store acceptance and reliability on every manufacturer's Android build are not established by a local compile.
