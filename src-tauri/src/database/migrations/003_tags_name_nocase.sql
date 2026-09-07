-- Make tag names unique case-insensitively (PLA == pla).
-- Keeps the existing tags / file_tags rows and cascade behavior.

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name_nocase
ON tags(name COLLATE NOCASE);
