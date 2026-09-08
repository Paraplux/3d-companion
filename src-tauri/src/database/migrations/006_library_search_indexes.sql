-- Indexes for Library search / filter (Phase 5.4).
CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension);
CREATE INDEX IF NOT EXISTS idx_file_notes_updated_at ON file_notes(updated_at);
