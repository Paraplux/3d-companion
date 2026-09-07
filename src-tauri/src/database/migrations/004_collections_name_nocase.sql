-- Make collection names unique case-insensitively (Ghostface == ghostface).
-- Keeps existing collections / collection_files rows and cascade behavior.

CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_name_nocase
ON collections(name COLLATE NOCASE);
