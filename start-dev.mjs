#!/usr/bin/env node
// Usage: node start-dev.mjs [--no-proxy] [vite args...]
import { spawn } from 'child_process';

const noProxy = process.argv.includes('--no-proxy') || process.env.VITE_NO_PROXY === 'true';
const viteArgs = process.argv.slice(2).filter(a => a !== '--no-proxy');
const childEnv = {
  ...process.env,
  ...(noProxy ? { VITE_NO_PROXY: 'true' } : {}),
};

let proxy;
let vite;
let shuttingDown = false;

const stopChildren = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  proxy?.kill();
  vite?.kill();
};

if (!noProxy) {
  proxy = spawn('node', ['proxy-server.mjs'], { stdio: 'inherit', env: childEnv });
  proxy.on('exit', (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`[dev] proxy server exited with code ${code}`);
      vite?.kill();
      process.exit(code ?? 1);
    }
  });
}

vite = spawn('npx', ['vite', ...viteArgs], { stdio: 'inherit', env: childEnv });
vite.on('exit', code => {
  stopChildren();
  process.exit(code ?? 0);
});

process.on('exit', stopChildren);
process.on('SIGINT', () => {
  stopChildren();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stopChildren();
  process.exit(143);
});
