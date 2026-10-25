ALTER TABLE devices ADD COLUMN icon_version INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE app_icons (device_id TEXT NOT NULL, package_name TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(device_id, package_name), FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE);
