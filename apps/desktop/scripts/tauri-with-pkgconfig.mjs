#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgconfigDir = resolve(__dirname, '../src-tauri/pkgconfig');
const separator = process.platform === 'win32' ? ';' : ':';
const existing = process.env.PKG_CONFIG_PATH;
process.env.PKG_CONFIG_PATH = existing
  ? `${pkgconfigDir}${separator}${existing}`
  : pkgconfigDir;

const args = process.argv
  .slice(2)
  .filter((arg, index) => !(index === 0 && arg === '--'));
const command = process.platform === 'win32' ? 'tauri.cmd' : 'tauri';

const child = spawn(command, args, {
  stdio: 'inherit',
  env: process.env,
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
