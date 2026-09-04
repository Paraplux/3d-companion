-- Phase 4: derived file analysis cache (local, regenerable).

CREATE TABLE file_metadata (
    library_file_id TEXT PRIMARY KEY NOT NULL,
    content_hash TEXT NOT NULL DEFAULT '',
    analysis_status TEXT NOT NULL,
    analysis_version INTEGER NOT NULL,
    analysis_error TEXT,
    thumbnail_relpath TEXT,
    format_kind TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    analyzed_at INTEGER,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_file_metadata_status ON file_metadata(analysis_status);
CREATE INDEX idx_file_metadata_content_hash ON file_metadata(content_hash);
CREATE INDEX idx_file_metadata_version ON file_metadata(analysis_version);
