# Roll & Write Foundry

Roll & Write Foundry is a mono-repository that powers the desktop application, core rules engine, and end-to-end tests for building roll-and-write board games.

## Getting started

### Prerequisites
- Node.js 18.18 or newer
- pnpm 8 or newer
- Rust toolchain (for Tauri builds)
- Linux desktop dependencies for Tauri:
  - `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`
  - `libsoup2.4-dev`, `libglib2.0-dev`, `pkg-config`, `build-essential`
  - The repository bundles compatibility `pkg-config` manifests and the build script generates
    the legacy `libwebkit2gtk-4.0` / `libjavascriptcoregtk-4.0` aliases automatically, so once
    the packages above are present the `pnpm --filter @rwf/app-desktop tauri build` command works
    without any manual symlink setup.

### Installation
```bash
pnpm -w install
pnpm install --recursive --prefer-offline
```

### Useful commands
| Command | Description |
| --- | --- |
| `pnpm -w build` | Build every workspace package |
| `pnpm -w test` | Run unit and end-to-end tests across the workspace |
| `pnpm -w lint` | Lint the entire repository |
| `pnpm -w format` | Check formatting across the repository |
| `pnpm --filter @rwf/app-desktop dev:web` | Launch the browser-targeted editor/playground (used by Playwright) |
| `pnpm --filter @rwf/app-desktop dev:tauri` | Start the desktop shell with the Tauri runtime |
| `pnpm -w --filter @rwf/app-desktop tauri build` | Produce desktop builds via Tauri |

### Desktop app overview

The desktop application now ships with two coordinated workspaces:

- **Editor** – a three-pane authoring surface with a template tree/form editor, JSON mode, board preview, and live schema validation.
  - Upload existing `.json` templates to inspect them, or edit the Meteor Miners sample directly.
  - Saving automatically bumps the patch version to keep template revisions traceable.
  - The preview pane simulates rolls/actions against the current draft so form edits are reflected immediately.
- **Play** – an in-app runner that honours the phase loop (roll → choose → apply → end) with undo/redo, action hints, and deterministic replay capture.
  - Apply a specific RNG seed before starting, or trigger the built-in auto-play to simulate a full 12-turn Meteor Miners session.
  - Completed runs are recorded as replays and can be reloaded to confirm scores and event history.

### Workspace layout
- `apps/desktop` – Tauri + React desktop shell
- `packages/core` – shared TypeScript core logic
- `e2e` – Playwright end-to-end tests
- `docs` – project documentation

## Continuous Integration
The repository includes a GitHub Actions workflow that installs dependencies, builds all packages, and runs the test suite to keep the workspace healthy from the very first commit.
