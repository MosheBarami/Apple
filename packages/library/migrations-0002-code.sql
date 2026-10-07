-- Code-module columns for library_items (packages/library/schema.sql); applied once to an existing table.
ALTER TABLE library_items ADD COLUMN package_name TEXT;
ALTER TABLE library_items ADD COLUMN deps TEXT;
ALTER TABLE library_items ADD COLUMN standalone INTEGER;
ALTER TABLE library_items ADD COLUMN bundle_key TEXT;
