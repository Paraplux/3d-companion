use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::AppHandle;

use super::models::{location_name_from_path, LibraryFile, LibraryLocation, LibrarySnapshot};
use super::persistence::{canonicalize_dir, load_locations, save_locations};
use super::scan::scan_location;
use super::watcher::LibraryWatcher;

pub struct LibraryState {
    locations: Mutex<Vec<LibraryLocation>>,
    watcher: LibraryWatcher,
    initialized: AtomicBool,
}

impl LibraryState {
    pub fn new() -> Self {
        Self {
            locations: Mutex::new(Vec::new()),
            watcher: LibraryWatcher::new(),
            initialized: AtomicBool::new(false),
        }
    }

    pub fn bootstrap(&self, app: &AppHandle) -> Result<LibrarySnapshot, String> {
        if !self.initialized.swap(true, Ordering::SeqCst) {
            let locations = load_locations(app)?;
            {
                let Ok(mut guard) = self.locations.lock() else {
                    self.initialized.store(false, Ordering::SeqCst);
                    return Err("Could not access library state.".into());
                };
                *guard = locations;
            }
            self.watcher.start(app.clone());
        }

        let locations = self.list_locations()?;
        let mut files = Vec::new();

        for location in &locations {
            self.watcher.watch(&location.path);
            match scan_location(&location.path) {
                Ok(mut location_files) => files.append(&mut location_files),
                Err(_) => {
                    // Keep the location listed even if the first scan fails.
                }
            }
        }

        Ok(LibrarySnapshot { locations, files })
    }

    pub fn list_locations(&self) -> Result<Vec<LibraryLocation>, String> {
        self.locations
            .lock()
            .map(|guard| guard.clone())
            .map_err(|_| "Could not access library state.".into())
    }

    pub fn add_location(
        &self,
        app: &AppHandle,
        path: String,
    ) -> Result<(LibraryLocation, Vec<LibraryFile>), String> {
        let canonical = canonicalize_dir(&path)?;

        {
            let Ok(guard) = self.locations.lock() else {
                return Err("Could not access library state.".into());
            };
            if guard.iter().any(|location| location.path == canonical) {
                return Err("This folder is already in your library.".into());
            }
        }

        let location = LibraryLocation {
            name: location_name_from_path(&canonical),
            path: canonical.clone(),
        };

        let files = scan_location(&canonical)?;

        {
            let Ok(mut guard) = self.locations.lock() else {
                return Err("Could not access library state.".into());
            };
            guard.push(location.clone());
            save_locations(app, &guard)?;
        }

        self.watcher.watch(&canonical);

        Ok((location, files))
    }

    pub fn remove_location(&self, app: &AppHandle, path: String) -> Result<(), String> {
        let removed = {
            let Ok(mut guard) = self.locations.lock() else {
                return Err("Could not access library state.".into());
            };

            let original_len = guard.len();
            guard.retain(|location| location.path != path);

            if guard.len() == original_len {
                return Err("That folder is not in your library.".into());
            }

            save_locations(app, &guard)?;
            true
        };

        if removed {
            self.watcher.unwatch(&path);
        }

        Ok(())
    }

    pub fn scan_one(&self, path: &str) -> Result<Vec<LibraryFile>, String> {
        let exists = self
            .locations
            .lock()
            .map_err(|_| "Could not access library state.".to_string())?
            .iter()
            .any(|location| location.path == path);

        if !exists {
            return Err("That folder is not in your library.".into());
        }

        scan_location(path)
    }

    pub fn scan_all(&self) -> Result<Vec<LibraryFile>, String> {
        let locations = self.list_locations()?;
        let mut files = Vec::new();

        for location in locations {
            let mut location_files = scan_location(&location.path)?;
            files.append(&mut location_files);
        }

        Ok(files)
    }
}
