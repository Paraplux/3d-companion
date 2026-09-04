-- Initial local index schema (Phase 3).
-- User-organization tables intentionally do NOT foreign-key to files,
-- so relations survive temporary physical absence.

CREATE TABLE library_locations (
    id TEXT PRIMARY KEY NOT NULL,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    library_file_id TEXT NOT NULL UNIQUE,
    content_hash TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    relative_path TEXT NOT NULL,
    location_path TEXT NOT NULL,
    name TEXT NOT NULL,
    extension TEXT NOT NULL,
    size INTEGER NOT NULL,
    modified_at INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL
);

CREATE TABLE projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE project_files (
    project_id TEXT NOT NULL,
    library_file_id TEXT NOT NULL,
    PRIMARY KEY (project_id, library_file_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE collections (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE collection_files (
    collection_id TEXT NOT NULL,
    library_file_id TEXT NOT NULL,
    PRIMARY KEY (collection_id, library_file_id),
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

CREATE TABLE tags (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
);

CREATE TABLE file_tags (
    library_file_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (library_file_id, tag_id),
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE favorites (
    library_file_id TEXT PRIMARY KEY NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE file_notes (
    library_file_id TEXT PRIMARY KEY NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_files_library_file_id ON files(library_file_id);
CREATE INDEX idx_files_content_hash ON files(content_hash);
CREATE INDEX idx_files_path ON files(path);
CREATE INDEX idx_files_location_path ON files(location_path);
CREATE INDEX idx_files_name ON files(name);

CREATE INDEX idx_project_files_library_file_id ON project_files(library_file_id);
CREATE INDEX idx_collection_files_library_file_id ON collection_files(library_file_id);
CREATE INDEX idx_file_tags_library_file_id ON file_tags(library_file_id);
CREATE INDEX idx_file_tags_tag_id ON file_tags(tag_id);
