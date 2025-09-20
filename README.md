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
  - Ubuntu 24.04 and other distros that only expose WebKitGTK 4.1 require compatibility pkg-config entries so crates that still
    look for the legacy 4.0 names can link successfully:

    ```bash
    sudo ln -sf /usr/lib/x86_64-linux-gnu/pkgconfig/webkit2gtk-4.1.pc /usr/lib/x86_64-linux-gnu/pkgconfig/webkit2gtk-4.0.pc
    sudo ln -sf /usr/lib/x86_64-linux-gnu/pkgconfig/webkit2gtk-web-extension-4.1.pc \
      /usr/lib/x86_64-linux-gnu/pkgconfig/webkit2gtk-web-extension-4.0.pc
    sudo ln -sf /usr/lib/x86_64-linux-gnu/pkgconfig/javascriptcoregtk-4.1.pc \
      /usr/lib/x86_64-linux-gnu/pkgconfig/javascriptcoregtk-4.0.pc
    sudo ln -sf /usr/lib/x86_64-linux-gnu/libwebkit2gtk-4.1.so /usr/lib/x86_64-linux-gnu/libwebkit2gtk-4.0.so
    sudo ln -sf /usr/lib/x86_64-linux-gnu/libwebkit2gtk-4.1.so.0 /usr/lib/x86_64-linux-gnu/libwebkit2gtk-4.0.so.0
    sudo ln -sf /usr/lib/x86_64-linux-gnu/libjavascriptcoregtk-4.1.so /usr/lib/x86_64-linux-gnu/libjavascriptcoregtk-4.0.so
    sudo ln -sf /usr/lib/x86_64-linux-gnu/libjavascriptcoregtk-4.1.so.0 /usr/lib/x86_64-linux-gnu/libjavascriptcoregtk-4.0.so.0
    ```

### Installation
```bash
pnpm -w install
pnpm install --recursive --prefer-offline
```

### Useful commands
| Command | Description |
| --- | --- |
| `pnpm -w build` | Build every workspace package |
| `pnpm -w test` | Run unit tests for every workspace |
| `pnpm -w lint` | Lint the entire repository |
| `pnpm -w format` | Check formatting across the repository |
| `pnpm -w --filter @rwf/app-desktop tauri build` | Produce desktop builds via Tauri |

### Workspace layout
- `apps/desktop` – Tauri + React desktop shell
- `packages/core` – shared TypeScript core logic
- `e2e` – Playwright end-to-end tests
- `docs` – project documentation

## Continuous Integration
The repository includes a GitHub Actions workflow that installs dependencies, builds all packages, and runs the test suite to keep the workspace healthy from the very first commit.
