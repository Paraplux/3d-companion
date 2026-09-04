use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

use tauri::{AppHandle, Emitter};

use crate::database::Database;
use crate::library::models::{
    location_name_from_path, AddLibraryLocationResult, LibraryEvent, LibraryFile, LibraryLocation,
    LibrarySnapshot,
};
use crate::library::persistence::{canonicalize_dir, load_locations, migrate_legacy_locations};
use crate::library::reconcile::reconcile_location;
use crate::library::watcher::LibraryWatcher;
use crate::repositories::files::{delete_by_location_path, list_files};
use crate::repositories::locations::{
    delete_location_by_path, find_location_by_path, insert_location,
};

pub struct LibraryState {
    db: Arc<Database>,
    watcher: LibraryWatcher,
    initialized: AtomicBool,
}

impl LibraryState {
    pub fn new(db: Database) -> Self {
        Self {
            db: Arc::new(db),
            watcher: LibraryWatcher::new(),
            initialized: AtomicBool::new(false),
        }
    }

    pub fn db(&self) -> Arc<Database> {
        Arc::clone(&self.db)
    }

    pub fn bootstrap(&self, app: &AppHandle) -> Result<LibrarySnapshot, String> {
        let first_boot = !self.initialized.swap(true, Ordering::SeqCst);

        if first_boot {
            migrate_legacy_locations(app, &self.db)?;
            self.watcher.start(app.clone(), Arc::clone(&self.db));
        }

        let locations = load_locations(&self.db)?;
        let files = self.db.with_conn(list_files)?;

        for location in &locations {
            self.watcher.watch(&location.path);
        }

        if first_boot && !locations.is_empty() {
            self.spawn_full_reconciliation(app.clone(), locations.clone());
        }

        Ok(LibrarySnapshot {
            locations: locations.clone(),
            files,
            reconciling: first_boot && !locations.is_empty(),
        })
    }

    pub fn list_locations(&self) -> Result<Vec<LibraryLocation>, String> {
        load_locations(&self.db)
    }

    pub fn list_files(&self) -> Result<Vec<LibraryFile>, String> {
        self.db.with_conn(list_files)
    }

    pub fn add_location(
        &self,
        app: &AppHandle,
        path: String,
    ) -> Result<AddLibraryLocationResult, String> {
        let canonical = canonicalize_dir(&path)?;

        let location = self.db.with_conn(|conn| {
            if find_location_by_path(conn, &canonical)?.is_some() {
                return Err("This folder is already in your library.".into());
            }

            let name = location_name_from_path(&canonical);
            insert_location(conn, &canonical, &name)
        })?;

        let files = reconcile_location(&self.db, &canonical)?;
        self.watcher.watch(&canonical);

        let _ = app.emit(
            "library://changed",
            LibraryEvent::LocationUpdated {
                location_path: canonical,
                files: files.clone(),
            },
        );

        Ok(AddLibraryLocationResult { location, files })
    }

    pub fn remove_location(&self, app: &AppHandle, path: String) -> Result<(), String> {
        self.db.with_conn(|conn| {
            let removed = delete_location_by_path(conn, &path)?;
            if !removed {
                return Err("That folder is not in your library.".into());
            }

            // Index rows only — never cascade into projects/tags/favorites/notes.
            delete_by_location_path(conn, &path)?;
            Ok(())
        })?;

        self.watcher.unwatch(&path);

        let _ = app.emit(
            "library://changed",
            LibraryEvent::LocationRemoved {
                location_path: path,
            },
        );

        Ok(())
    }

    pub fn rescan_location(&self, path: &str) -> Result<Vec<LibraryFile>, String> {
        let exists = self
            .db
            .with_conn(|conn| Ok(find_location_by_path(conn, path)?.is_some()))?;

        if !exists {
            return Err("That folder is not in your library.".into());
        }

        reconcile_location(&self.db, path)
    }

    pub fn rescan_all(&self) -> Result<Vec<LibraryFile>, String> {
        let locations = self.list_locations()?;
        for location in &locations {
            reconcile_location(&self.db, &location.path)?;
        }
        self.list_files()
    }

    pub fn search_files(&self, query: &str) -> Result<Vec<LibraryFile>, String> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return self.list_files();
        }

        self.db
            .with_conn(|conn| crate::repositories::files::search_files(conn, trimmed))
    }

    fn spawn_full_reconciliation(&self, app: AppHandle, locations: Vec<LibraryLocation>) {
        let db = Arc::clone(&self.db);
        thread::spawn(move || {
            for location in &locations {
                match reconcile_location(&db, &location.path) {
                    Ok(files) => {
                        let _ = app.emit(
                            "library://changed",
                            LibraryEvent::LocationUpdated {
                                location_path: location.path.clone(),
                                files,
                            },
                        );
                    }
                    Err(_) => continue,
                }
            }

            if let Ok(files) = db.with_conn(list_files) {
                let _ = app.emit(
                    "library://changed",
                    LibraryEvent::ReconciliationFinished { files },
                );
            }
        });
    }
}
