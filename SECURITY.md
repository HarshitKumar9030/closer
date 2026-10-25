# Security

Closer handles private phone activity. Never include owner keys, writer/viewer tokens, database URIs, activity records or screenshots of real usage in a public issue.

Report a vulnerability through GitHub's private vulnerability reporting when available. If it is unavailable, ask the maintainer for a private contact route without posting the vulnerability details.

Use HTTPS, a random owner key of at least 32 characters, authenticated MongoDB, a private database network, and encrypted backups. Keep the runtime and container images patched. Rotate the viewing link to revoke access. Deleting a phone removes its stored history, sessions and icons.

The deployment targets one Node process. Do not run multiple application replicas without shared write coordination or MongoDB transactions. The sample dashboard contains synthetic data; it must remain visibly labelled.
