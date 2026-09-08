use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

use tauri::{AppHandle, Emitter, Manager};

use crate::database::Database;
use crate::library::models::{
    location_name_from_path, AddLibraryLocationResult, BackgroundTasksEvent, LibraryEvent,
    LibraryFile, LibraryLocation, LibrarySnapshot,
};
use crate::library::persistence::{canonicalize_dir, load_locations, migrate_legacy_locations};
use crate::library::reconcile::{reconcile_location, AnalysisRequest};
use crate::library::tasks::TaskManager;
use crate::library::watcher::LibraryWatcher;
use crate::repositories::files::{delete_by_location_path, list_files};
use crate::repositories::locations::{
    delete_location_by_path, find_location_by_path, insert_location,
};

pub struct LibraryState {
    db: Arc<Database>,
    watcher: LibraryWatcher,
    tasks: TaskManager,
    thumbnails_dir: PathBuf,
    initialized: AtomicBool,
}

impl LibraryState {
    pub fn new(app: &AppHandle, db: Database) -> Result<Self, String> {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("Could not resolve app data directory: {error}"))?;
        let thumbnails_dir = data_dir.join("thumbnails");
        std::fs::create_dir_all(&thumbnails_dir)
            .map_err(|error| format!("Could not create thumbnails directory: {error}"))?;

        Ok(Self {
            db: Arc::new(db),
            watcher: LibraryWatcher::new(),
            tasks: TaskManager::new(),
            thumbnails_dir,
            initialized: AtomicBool::new(false),
        })
    }

    pub fn db(&self) -> Arc<Database> {
        Arc::clone(&self.db)
    }

    pub fn background_tasks(&self) -> BackgroundTasksEvent {
        self.tasks.snapshot()
    }

    pub fn enqueue_analysis(&self, app: &AppHandle, requests: Vec<AnalysisRequest>) {
        self.tasks.enqueue_many(app, requests);
    }

    pub fn bootstrap(&self, app: &AppHandle) -> Result<LibrarySnapshot, String> {
        let first_boot = !self.initialized.swap(true, Ordering::SeqCst);

        if first_boot {
            migrate_legacy_locations(app, &self.db)?;
            self.watcher
                .start(app.clone(), Arc::clone(&self.db), self.thumbnails_dir.clone());
            self.tasks
                .start(app.clone(), Arc::clone(&self.db), self.thumbnails_dir.clone());
        }

        let locations = load_locations(&self.db)?;
        let files = self
            .db
            .with_conn(|conn| list_files(conn, &self.thumbnails_dir))?;

        for location in &locations {
            self.watcher.watch(&location.path);
        }

        if first_boot && !locations.is_empty() {
            self.spawn_full_reconciliation(app.clone(), locations.clone());
        } else if first_boot {
            self.enqueue_pending(app);
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
        self.db
            .with_conn(|conn| list_files(conn, &self.thumbnails_dir))
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

        let (files, requests) = reconcile_location(&self.db, &canonical, &self.thumbnails_dir)?;
        self.watcher.watch(&canonical);
        self.enqueue_analysis(app, requests);

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

    pub fn rescan_location(&self, app: &AppHandle, path: &str) -> Result<Vec<LibraryFile>, String> {
        let exists = self
            .db
            .with_conn(|conn| Ok(find_location_by_path(conn, path)?.is_some()))?;

        if !exists {
            return Err("That folder is not in your library.".into());
        }

        let (files, requests) = reconcile_location(&self.db, path, &self.thumbnails_dir)?;
        self.enqueue_analysis(app, requests);
        Ok(files)
    }

    pub fn rescan_all(&self, app: &AppHandle) -> Result<Vec<LibraryFile>, String> {
        let locations = self.list_locations()?;
        for location in &locations {
            let (_files, requests) =
                reconcile_location(&self.db, &location.path, &self.thumbnails_dir)?;
            self.enqueue_analysis(app, requests);
        }
        self.list_files()
    }

    pub fn query_files(
        &self,
        request: &crate::library::models::LibrarySearchRequest,
    ) -> Result<Vec<LibraryFile>, String> {
        self.db.with_conn(|conn| {
            crate::repositories::files::query_library_files(
                conn,
                request,
                &self.thumbnails_dir,
            )
        })
    }

    fn enqueue_pending(&self, app: &AppHandle) {
        if let Ok(pending) = self
            .db
            .with_conn(crate::repositories::files::files_needing_analysis)
        {
            let requests = pending
                .into_iter()
                .map(|(library_file_id, path, extension, name)| AnalysisRequest {
                    library_file_id,
                    path,
                    extension,
                    name,
                })
                .collect();
            self.enqueue_analysis(app, requests);
        }
    }

    fn spawn_full_reconciliation(&self, app: AppHandle, locations: Vec<LibraryLocation>) {
        let db = Arc::clone(&self.db);
        let thumbnails_dir = self.thumbnails_dir.clone();

        thread::spawn(move || {
            for location in &locations {
                match reconcile_location(&db, &location.path, &thumbnails_dir) {
                    Ok((files, requests)) => {
                        if let Some(state) = app.try_state::<LibraryState>() {
                            state.enqueue_analysis(&app, requests);
                        }
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

            if let Ok(files) = db.with_conn(|conn| list_files(conn, &thumbnails_dir)) {
                let _ = app.emit(
                    "library://changed",
                    LibraryEvent::ReconciliationFinished { files },
                );
            }
        });
    }

    pub fn get_model_geometry(
        &self,
        app: &AppHandle,
        library_file_id: &str,
        plate_id: Option<String>,
    ) -> Result<crate::library::geometry::ModelGeometryResponse, String> {
        let file = self
            .db
            .with_conn(|conn| {
                crate::repositories::files::get_file(conn, library_file_id, &self.thumbnails_dir)
            })?
            .ok_or_else(|| "Model not found.".to_string())?;

        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("Could not resolve app data directory: {error}"))?;
        let cache_dir = crate::library::geometry::geometry_cache_dir(&data_dir);
        std::fs::create_dir_all(&cache_dir)
            .map_err(|error| format!("Could not create geometry cache: {error}"))?;

        crate::library::geometry::load_model_geometry(&file, plate_id.as_deref(), &cache_dir)
    }

    pub fn open_in_bambu_studio(&self, library_file_id: &str) -> Result<(), String> {
        self.db.with_conn(|conn| {
            crate::library::bambu_studio::open_library_file_in_bambu_studio(
                conn,
                &self.thumbnails_dir,
                library_file_id,
            )
        })
    }
}
