use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;

use tauri::{AppHandle, Emitter};

use crate::database::Database;
use crate::library::analysis::{analyze_file, mark_analyzing, mark_error, mark_ready};
use crate::library::models::{
    AnalysisStatus, BackgroundTask, BackgroundTaskStatus, BackgroundTaskType, BackgroundTasksEvent,
    LibraryEvent,
};
use crate::library::reconcile::AnalysisRequest;
use crate::library::util::{hash_file, new_id};
use crate::repositories::files::{
    find_by_content_hash, find_by_path, get_file, update_content_hash, update_file_identity_and_path,
};
use crate::repositories::metadata::delete_metadata;

#[derive(Clone)]
struct Job {
    library_file_id: String,
    path: String,
    extension: String,
    name: String,
}

pub struct TaskManager {
    tx: Mutex<Sender<Job>>,
    tasks: Arc<Mutex<HashMap<String, BackgroundTask>>>,
    started: AtomicBool,
}

impl TaskManager {
    pub fn new() -> Self {
        let (tx, _rx) = channel::<Job>();
        Self {
            tx: Mutex::new(tx),
            tasks: Arc::new(Mutex::new(HashMap::new())),
            started: AtomicBool::new(false),
        }
    }

    pub fn start(&self, app: AppHandle, db: Arc<Database>, thumbnails_dir: PathBuf) {
        if self.started.swap(true, Ordering::SeqCst) {
            return;
        }

        let (tx, rx) = channel::<Job>();
        if let Ok(mut guard) = self.tx.lock() {
            *guard = tx;
        }

        let tasks = Arc::clone(&self.tasks);
        let worker_count = 2_usize;

        // Shared receiver via mutex for multiple workers.
        let rx = Arc::new(Mutex::new(rx));

        for _ in 0..worker_count {
            let app = app.clone();
            let db = Arc::clone(&db);
            let thumbnails_dir = thumbnails_dir.clone();
            let tasks = Arc::clone(&tasks);
            let rx = Arc::clone(&rx);

            thread::spawn(move || worker_loop(app, db, thumbnails_dir, tasks, rx));
        }
    }

    pub fn enqueue_many(&self, app: &AppHandle, requests: Vec<AnalysisRequest>) {
        for request in requests {
            self.enqueue(app, request);
        }
    }

    pub fn enqueue(&self, app: &AppHandle, request: AnalysisRequest) {
        let task_id = new_id();
        let task = BackgroundTask {
            id: task_id.clone(),
            task_type: BackgroundTaskType::Hashing,
            status: BackgroundTaskStatus::Queued,
            progress: None,
            label: format!("Queuing {}…", request.name),
            error: None,
        };

        if let Ok(mut tasks) = self.tasks.lock() {
            // Deduplicate by library_file_id: replace previous queued task label.
            tasks.retain(|_, existing| {
                !existing.label.contains(&request.name)
                    || existing.status == BackgroundTaskStatus::Running
            });
            tasks.insert(request.library_file_id.clone(), task);
        }
        emit_tasks(app, &self.tasks);

        let job = Job {
            library_file_id: request.library_file_id,
            path: request.path,
            extension: request.extension,
            name: request.name,
        };

        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(job);
        }
    }

    pub fn snapshot(&self) -> BackgroundTasksEvent {
        snapshot_from(&self.tasks)
    }
}

fn worker_loop(
    app: AppHandle,
    db: Arc<Database>,
    thumbnails_dir: PathBuf,
    tasks: Arc<Mutex<HashMap<String, BackgroundTask>>>,
    rx: Arc<Mutex<Receiver<Job>>>,
) {
    loop {
        let job = {
            let Ok(receiver) = rx.lock() else {
                break;
            };
            match receiver.recv() {
                Ok(job) => job,
                Err(_) => break,
            }
        };

        process_job(&app, &db, &thumbnails_dir, &tasks, job);
    }
}

fn process_job(
    app: &AppHandle,
    db: &Database,
    thumbnails_dir: &Path,
    tasks: &Mutex<HashMap<String, BackgroundTask>>,
    job: Job,
) {
    update_task(
        app,
        tasks,
        &job.library_file_id,
        BackgroundTaskType::Hashing,
        BackgroundTaskStatus::Running,
        format!("Hashing {}…", job.name),
        None,
    );

    let hash_result = hash_file(Path::new(&job.path));
    let content_hash = match hash_result {
        Ok(hash) => hash,
        Err(error) => {
            let _ = db.with_conn(|conn| mark_error(conn, &job.library_file_id, "", &error));
            update_task(
                app,
                tasks,
                &job.library_file_id,
                BackgroundTaskType::Hashing,
                BackgroundTaskStatus::Error,
                format!("Failed {}", job.name),
                Some(error),
            );
            remove_task_later(app, tasks, &job.library_file_id);
            return;
        }
    };

    // Keep library_file_id stable. Optionally merge move-by-hash for brand-new paths.
    let effective_id = db
        .with_conn(|conn| {
            let current = find_by_path(conn, &job.path)?;
            let mut library_file_id = job.library_file_id.clone();

            if let Some(current_row) = current {
                library_file_id = current_row.library_file_id.clone();

                if current_row.content_hash.is_empty() {
                    if let Some(by_hash) = find_by_content_hash(conn, &content_hash)? {
                        let old_missing = !Path::new(&by_hash.path).exists();
                        if old_missing && by_hash.library_file_id != current_row.library_file_id {
                            // Move: preserve older logical identity and drop provisional id.
                            let mut merged = crate::library::models::LibraryFile {
                                library_file_id: by_hash.library_file_id.clone(),
                                content_hash: content_hash.clone(),
                                path: current_row.path.clone(),
                                name: current_row.name.clone(),
                                extension: current_row.extension.clone(),
                                size: current_row.size,
                                modified_at: current_row.modified_at,
                                relative_path: current_row.relative_path.clone(),
                                location_path: current_row.location_path.clone(),
                                analysis_status: AnalysisStatus::Pending,
                                analysis_error: None,
                                thumbnail_path: None,
                                stl: None,
                                threemf: None,
                            };
                            // Use scanned name/extension from job when available.
                            merged.name = job.name.clone();
                            merged.extension = job.extension.clone();
                            merged.path = job.path.clone();

                            update_file_identity_and_path(conn, &by_hash.library_file_id, &merged)?;
                            delete_metadata(conn, &current_row.library_file_id)?;
                            conn.execute(
                                "DELETE FROM files WHERE library_file_id = ?1",
                                rusqlite::params![current_row.library_file_id],
                            )
                            .map_err(|error| format!("Could not drop provisional file row: {error}"))?;
                            library_file_id = by_hash.library_file_id;
                        }
                    }
                }

                update_content_hash(conn, &library_file_id, &content_hash)?;
            }

            Ok(library_file_id)
        })
        .unwrap_or(job.library_file_id.clone());

    update_task(
        app,
        tasks,
        &effective_id,
        BackgroundTaskType::Analyzing,
        BackgroundTaskStatus::Running,
        format!("Analyzing {}…", job.name),
        None,
    );

    let _ = db.with_conn(|conn| mark_analyzing(conn, &effective_id, &content_hash));

    let analysis = analyze_file(
        Path::new(&job.path),
        &job.extension,
        &content_hash,
        thumbnails_dir,
    );

    match analysis {
        Ok(outcome) => {
            update_task(
                app,
                tasks,
                &effective_id,
                BackgroundTaskType::Thumbnail,
                BackgroundTaskStatus::Running,
                format!("Thumbnail {}…", job.name),
                None,
            );

            let _ = db.with_conn(|conn| mark_ready(conn, &effective_id, &content_hash, &outcome));

            if let Ok(Some(file)) = db.with_conn(|conn| get_file(conn, &effective_id, thumbnails_dir))
            {
                let _ = app.emit(
                    "library://changed",
                    LibraryEvent::FileAnalyzed { file },
                );
            }

            update_task(
                app,
                tasks,
                &effective_id,
                BackgroundTaskType::Analyzing,
                BackgroundTaskStatus::Completed,
                format!("Ready {}", job.name),
                None,
            );
        }
        Err(error) => {
            let _ = db.with_conn(|conn| mark_error(conn, &effective_id, &content_hash, &error));
            if let Ok(Some(file)) = db.with_conn(|conn| get_file(conn, &effective_id, thumbnails_dir))
            {
                let _ = app.emit(
                    "library://changed",
                    LibraryEvent::FileAnalyzed { file },
                );
            }
            update_task(
                app,
                tasks,
                &effective_id,
                BackgroundTaskType::Analyzing,
                BackgroundTaskStatus::Error,
                format!("Failed {}", job.name),
                Some(error),
            );
        }
    }

    remove_task_later(app, tasks, &effective_id);
}

fn update_task(
    app: &AppHandle,
    tasks: &Mutex<HashMap<String, BackgroundTask>>,
    key: &str,
    task_type: BackgroundTaskType,
    status: BackgroundTaskStatus,
    label: String,
    error: Option<String>,
) {
    if let Ok(mut map) = tasks.lock() {
        let id = map
            .get(key)
            .map(|task| task.id.clone())
            .unwrap_or_else(new_id);
        map.insert(
            key.to_string(),
            BackgroundTask {
                id,
                task_type,
                status,
                progress: None,
                label,
                error,
            },
        );
    }
    emit_tasks(app, tasks);
}

fn remove_task_later(
    app: &AppHandle,
    tasks: &Mutex<HashMap<String, BackgroundTask>>,
    key: &str,
) {
    if let Ok(mut map) = tasks.lock() {
        map.remove(key);
    }
    emit_tasks(app, tasks);
}

fn emit_tasks(app: &AppHandle, tasks: &Mutex<HashMap<String, BackgroundTask>>) {
    let event = snapshot_from(tasks);
    let _ = app.emit("background://tasks", event);
}

fn snapshot_from(tasks: &Mutex<HashMap<String, BackgroundTask>>) -> BackgroundTasksEvent {
    let map = tasks.lock().ok();
    let list = map
        .as_ref()
        .map(|values| values.values().cloned().collect::<Vec<_>>())
        .unwrap_or_default();

    let active: Vec<_> = list
        .iter()
        .filter(|task| {
            matches!(
                task.status,
                BackgroundTaskStatus::Queued | BackgroundTaskStatus::Running
            )
        })
        .cloned()
        .collect();

    let label = if active.is_empty() {
        None
    } else if active.len() == 1 {
        Some(active[0].label.clone())
    } else {
        Some(format!("Analyzing 3D files… {} remaining", active.len()))
    };

    BackgroundTasksEvent {
        active_count: active.len(),
        label,
        tasks: list,
    }
}
