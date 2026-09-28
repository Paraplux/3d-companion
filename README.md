# 3D Companion

Companion desktop app for Bambu Studio. This repository currently contains the Tauri 2 + React bootstrap only.

## Stack

- Tauri 2
- React
- TypeScript
- Vite
- pnpm

## Prerequisites (macOS)

Install these once on a new machine.

### 1. Xcode Command Line Tools

```bash
xcode-select --install
```

### 2. Node.js 22+

Any current LTS install works. Example with [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 22
nvm use 22
node --version
```

### 3. pnpm

```bash
corepack enable
corepack prepare pnpm@11.8.0 --activate
pnpm --version
```

Or:

```bash
npm install -g pnpm@11.8.0
```

### 4. Rust

Install with the official installer (recommended):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Restart the terminal, then verify:

```bash
source "$HOME/.cargo/env"
rustc --version
cargo --version
```

If Rust was installed via Homebrew rustup instead, make sure both binaries are on your `PATH`:

```bash
export PATH="/opt/homebrew/opt/rustup/bin:$HOME/.cargo/bin:$PATH"
```

## First setup

```bash
git clone <repository-url> 3d-companion
cd 3d-companion
pnpm install
```

## Development

Start the native window with hot reload:

```bash
pnpm tauri dev
```

Typecheck the frontend only:

```bash
pnpm typecheck
```

Build the frontend only (without packaging the desktop app):

```bash
pnpm build
```

## Production build

Build the macOS `.app` and `.dmg`:

```bash
pnpm tauri build
```

Artifacts are written under `src-tauri/target/release/bundle/`.

## Useful scripts

| Command | Description |
| --- | --- |
| `pnpm install` | Install JS dependencies |
| `pnpm tauri dev` | Run the desktop app in development |
| `pnpm tauri build` | Build the macOS app bundle |
| `pnpm typecheck` | Run TypeScript (`tsc --noEmit`) |
| `pnpm build` | Compile TypeScript and build the Vite frontend |
| `pnpm preview` | Preview the Vite production build in a browser |
