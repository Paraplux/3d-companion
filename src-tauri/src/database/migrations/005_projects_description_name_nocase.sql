-- Optional project description + case-insensitive unique names (mirrors collections).
ALTER TABLE projects ADD COLUMN description TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_name_nocase
ON projects(name COLLATE NOCASE);
