CREATE TABLE pairings (code_hash TEXT PRIMARY KEY, device_id TEXT NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL, expires INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE devices (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, writer_hash TEXT NOT NULL UNIQUE, viewer_hash TEXT NOT NULL UNIQUE, updated INTEGER NOT NULL DEFAULT 0, paused INTEGER NOT NULL DEFAULT 0, snapshot TEXT);
--> statement-breakpoint
CREATE TABLE days (device_id TEXT NOT NULL, day TEXT NOT NULL, snapshot TEXT NOT NULL, PRIMARY KEY (device_id, day), FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TABLE limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
