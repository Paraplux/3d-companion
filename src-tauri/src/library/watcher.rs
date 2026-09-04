use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};

use crate::database::Database;
use crate::library::models::LibraryEvent;
use crate::library::reconcile::reconcile_location;
use crate::library::state::LibraryState;

#[derive(Debug)]
enum WatchCommand {
    Watch(String),
    Unwatch(String),
}

pub struct LibraryWatcher {
    command_tx: Mutex<Option<Sender<WatchCommand>>>,
}

impl LibraryWatcher {
    pub fn new() -> Self {
        Self {
            command_tx: Mutex::new(None),
        }
    }

    pub fn start(&self, app: AppHandle, db: Arc<Database>, thumbnails_dir: PathBuf) {
        let mut guard = match self.command_tx.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };

        if guard.is_some() {
            return;
        }

        let (command_tx, command_rx) = mpsc::channel::<WatchCommand>();
        *guard = Some(command_tx);

        thread::spawn(move || {
            let mut watchers: HashMap<String, RecommendedWatcher> = HashMap::new();
            let pending: Arc<Mutex<HashMap<String, ()>>> = Arc::new(Mutex::new(HashMap::new()));
            let (event_tx, event_rx) = mpsc::channel::<String>();

            let pending_for_debounce = Arc::clone(&pending);
            let app_for_debounce = app.clone();
            let db_for_debounce = Arc::clone(&db);
            let thumbnails_dir = thumbnails_dir.clone();

            thread::spawn(move || loop {
                match event_rx.recv() {
                    Ok(location_path) => {
                        {
                            let Ok(mut map) = pending_for_debounce.lock() else {
                                continue;
                            };
                            map.insert(location_path, ());
                        }

                        thread::sleep(Duration::from_millis(350));

                        let locations: Vec<String> = {
                            let Ok(mut map) = pending_for_debounce.lock() else {
                                continue;
                            };
                            map.drain().map(|(path, _)| path).collect()
                        };

                        for location_path in locations {
                            match reconcile_location(
                                &db_for_debounce,
                                &location_path,
                                &thumbnails_dir,
                            ) {
                                Ok((files, requests)) => {
                                    if let Some(state) = app_for_debounce.try_state::<LibraryState>()
                                    {
                                        state.enqueue_analysis(&app_for_debounce, requests);
                                    }
                                    let _ = app_for_debounce.emit(
                                        "library://changed",
                                        LibraryEvent::LocationUpdated {
                                            location_path,
                                            files,
                                        },
                                    );
                                }
                                Err(_) => {}
                            }
                        }
                    }
                    Err(_) => break,
                }
            });

            while let Ok(command) = command_rx.recv() {
                match command {
                    WatchCommand::Watch(location_path) => {
                        if watchers.contains_key(&location_path) {
                            continue;
                        }

                        let event_tx = event_tx.clone();
                        let watched_root = location_path.clone();

                        let mut watcher = match RecommendedWatcher::new(
                            move |result: Result<notify::Event, notify::Error>| {
                                let Ok(event) = result else {
                                    return;
                                };

                                if !is_relevant_event(&event.kind) {
                                    return;
                                }

                                let _ = event_tx.send(watched_root.clone());
                            },
                            notify::Config::default(),
                        ) {
                            Ok(watcher) => watcher,
                            Err(_) => continue,
                        };

                        if watcher
                            .watch(Path::new(&location_path), RecursiveMode::Recursive)
                            .is_ok()
                        {
                            watchers.insert(location_path, watcher);
                        }
                    }
                    WatchCommand::Unwatch(location_path) => {
                        watchers.remove(&location_path);
                    }
                }
            }
        });
    }

    pub fn watch(&self, location_path: &str) {
        if let Ok(guard) = self.command_tx.lock() {
            if let Some(tx) = guard.as_ref() {
                let _ = tx.send(WatchCommand::Watch(location_path.to_string()));
            }
        }
    }

    pub fn unwatch(&self, location_path: &str) {
        if let Ok(guard) = self.command_tx.lock() {
            if let Some(tx) = guard.as_ref() {
                let _ = tx.send(WatchCommand::Unwatch(location_path.to_string()));
            }
        }
    }
}

fn is_relevant_event(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_)
            | EventKind::Modify(_)
            | EventKind::Remove(_)
            | EventKind::Any
    )
}
