# Architecture — Data Separation

This document is the reference for how **3D Library** separates physical files, portable library organization, local indexes, and per-machine configuration.

It prepares Phases 3+ (SQLite, sync). It does **not** implement those systems yet.

---

## Four kinds of data

| Layer | Role | Portable / synced? |
| --- | --- | --- |
| **Physical files** | Real `.stl` / `.3mf` / `.obj` / `.step` / `.stp` on disk | Optionally later (e.g. Syncthing) |
| **Library Data** | User organization: projects, collections, tags, favorites, notes, relations | Yes (future) |
| **Local SQLite** | Per-machine index / cache of derived data | **Never** |
| **Local App Config** | Library folder paths, theme, window/UI prefs | **Never** |

```
                    ┌──────────────────────┐
                    │    Physical Files    │
                    │     STL / 3MF / ...  │
                    └──────────┬───────────┘
                               │
                         filesystem
                               │
                    ┌──────────▼───────────┐
                    │    Local SQLite      │
                    │  derived / index     │
                    └──────────────────────┘

                    ┌──────────────────────┐
                    │    Library Data      │
                    │ projects / tags /    │
                    │ collections / stars  │
                    └──────────┬───────────┘
                               │
                         future sync
                               │
                    ┌──────────┴───────────┐
                    │                      │
                 MacBook                  iMac
                    │                      │
                SQLite                  SQLite

┌──────────────────────────────┐
│      Local App Config        │
│ library locations, theme,    │
│ window / UI preferences      │
└──────────────────────────────┘
```

---

## 1. Physical files

Files stay where the user put them. They may be scattered:

```
~/Downloads/robot.3mf
~/Desktop/support.stl
~/Documents/3D/vase.3mf
```

The app builds a **logical** organization on top. It does **not** assume disk layout matches projects or collections.

**Default rule:** assigning a file to a project / collection / tag / favorite is a **logical relation only**. Files are **not** moved or renamed automatically.

---

## 2. Library Data (syncable)

**Library Data** is the portable source of truth for user-created organization:

- Projects
- Collections
- Tags
- Favorites
- Relations (file ↔ project / collection / tag)
- Optional notes

### Stable file identity vs content fingerprint

Do **not** key logical organization by absolute path or by content hash alone:

```
/Users/me/Downloads/robot.3mf   ❌ not a stable identity
contentHash = a83f…91bc         ❌ not a stable identity (changes when edited)
```

A logical file has **two** distinct fields:

```
Logical File
├── fileId        ← stable business identity
└── contentHash   ← fingerprint of current contents (may change)
```

| Field | Meaning | Stable when file is edited? |
| --- | --- | --- |
| `fileId` (`LibraryFileId`) | “this logical file in my library” | **Yes** |
| `contentHash` | “bytes currently on disk” (e.g. SHA-256) | **No** — updates after Bambu Studio edits, etc. |

Syncable relations (project / collection / tag / favorite / note) always reference **`fileId`**, never `path` or `contentHash`.

`contentHash` is still useful later for change detection, duplicate detection, finding a moved file, and sync — but it is **not** the business key.

How a machine re-associates a path or a new hash with an existing `fileId` is deferred to Phase 3/4 (local index + scanner). Types only for now.

Entity IDs (`project.id`, `collection.id`, `tag.id`, `fileId`) are stable opaque strings. **Names are not identifiers** — renaming “Robot” → “Projet Robot 2026” must not break relations.

### Document contract

TypeScript contract: `src/types/libraryData.ts`.

Intended on-disk shape (future), versioned JSON such as `library.json`:

```json
{
  "version": 1,
  "projects": [],
  "collections": [],
  "tags": [],
  "favorites": [],
  "notes": [],
  "relations": {
    "projectFiles": [],
    "collectionFiles": [],
    "fileTags": []
  }
}
```

`version` allows the format to evolve. Sync and merge are **out of scope** until a later phase.

### User data vs derived data

**Preserve / sync (user data):**

- Project, Collection, Tag, Favorite, Note, Relations

**Recompute locally (derived — cached in SQLite + AppData):**

- filename, absolute path, size, modified date  
- `contentHash` (SHA-256)  
- analysis status / version  
- thumbnails (`{appData}/thumbnails/{contentHash}.webp`)  
- STL/3MF parsed metadata (JSON blob in `file_metadata`)  
- Bambu-specific fields when reliably detected  

Thumbnails and derived metadata are a **local regenerable cache**. Deleting them must not lose user organization.

---

## 3. Local SQLite

Each computer owns its **own** SQLite database as a **local index** (`library.db` under App Data).

Schema includes physical file rows (`files`) and regenerable analysis cache (`file_metadata`).

User-organization tables reference `library_file_id` without FK cascade onto physical rows, so relations survive temporary absence and content edits.

### Why SQLite must never be synced directly

- Absolute paths differ per machine.
- Indexes and caches are disposable and rebuildable.
- Syncing the DB file would fight with concurrent writers and produce conflicts that are hard to resolve.
- Portable truth lives in **Library Data**, not in the DB file.

---

## 4. Local App Configuration

Machine-specific settings stay local. TypeScript contract: `src/types/appConfig.ts`.

Examples:

- Library locations (folder paths on **this** Mac)
- Theme (system / light / dark)
- Window size / position
- Sidebar width
- Other UI preferences

Today, library locations are already persisted by the Rust backend; theme is persisted in the webview. Window geometry is reserved for later.

Different machines may point at different folders for the same logical library:

| Machine | Library location |
| --- | --- |
| MacBook | `~/Documents/3D` |
| iMac | `~/Desktop/3D` |

---

## 5. Target sync picture (future)

```
                 Sync
                   │
       ┌───────────┴───────────┐
       │                       │
    MacBook                   iMac
       │                       │
       ├── Physical Files      ├── Physical Files
       ├── Library Data        ├── Library Data
       └── SQLite local        └── SQLite local
```

- Physical files: optional external sync (e.g. Syncthing) — not built into the app yet.
- Library Data: future first-class sync.
- SQLite: always local, rebuilt/updated from disk + Library Data.
- App config: always local.

---

## 6. Current codebase mapping

| Concept | Today |
| --- | --- |
| Physical file discovery | Rust scan + watcher (`src-tauri/src/library/`) |
| Local SQLite index | `library.db` in app data dir (`src-tauri/src/database/`) |
| Indexed file list in UI | `LibraryFile` DTO from SQLite via Tauri commands |
| Library locations (local config) | `library_locations` table (legacy JSON migrated once) |
| Theme (local config) | `localStorage` via `src/lib/theme.ts` |
| Library Data types | `src/types/libraryData.ts` (contract; sync later) |
| App config types | `src/types/appConfig.ts` |
| Projects / collections / tags tables | Present in SQLite; UI CRUD later |
| Syncthing / backup | Not introduced |

---

## 7. Decisions locked in

1. Logical organization is independent of absolute paths.
2. `LibraryFileId` is the stable identity for syncable relations; `ContentHash` is only a content fingerprint.
3. Library Data ≠ SQLite ≠ App Config.
4. SQLite is never the sync medium.
5. Assigning files to projects does not move files by default.

## 8. Decisions deferred

- Exact ID scheme refinements (currently UUID v4 for new entities).
- Richer re-association of `library_file_id` after complex move/edit conflicts.
- Where portable `library.json` lives on disk and how conflicts are merged.
- Syncthing integration details.
- Optional explicit “organize on disk” / move feature.
- STL/3MF parsing and thumbnails.
