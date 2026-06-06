#!/usr/bin/env node
// Usage: node start-preview.mjs [--no-proxy] [vite preview args...]
import { spawn } from 'child_process';

const previewArgs = process.argv.slice(2);
const noProxy = previewArgs.includes('--no-proxy') || process.env.VITE_NO_PROXY === 'true';
const childEnv = {
  ...process.env,
  ...(noProxy ? { VITE_NO_PROXY: 'true' } : { VITE_USE_PROXY: 'true' }),
};

let preview;
let shuttingDown = false;

const stopPreview = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  preview?.kill();
};

const build = spawn('npx', ['vite', 'build'], { stdio: 'inherit', env: childEnv });

build.on('exit', code => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }

  preview = spawn('node', ['start-dev.mjs', 'preview', ...previewArgs], { stdio: 'inherit', env: childEnv });
  preview.on('exit', previewCode => {
    stopPreview();
    process.exit(previewCode ?? 0);
  });
});

process.on('exit', stopPreview);
process.on('SIGINT', () => {
  stopPreview();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stopPreview();
  process.exit(143);
});
