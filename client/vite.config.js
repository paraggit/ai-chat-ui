import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const certDir = path.resolve(__dirname, '../certs');
const keyPath = path.join(certDir, 'key.pem');
const certPath = path.join(certDir, 'cert.pem');
const sslEnabled =
  process.env.SSL_ENABLED === 'true' &&
  fs.existsSync(keyPath) &&
  fs.existsSync(certPath);

const apiTarget = sslEnabled ? 'https://localhost:3001' : 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    https: sslEnabled
      ? {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        }
      : undefined,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
        timeout: 600000,
        proxyTimeout: 600000,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req) => {
            if (req.url?.includes('/chat') && proxyRes.headers) {
              proxyRes.headers['cache-control'] = 'no-cache, no-transform';
              proxyRes.headers['x-accel-buffering'] = 'no';
              proxyRes.headers['content-type'] = 'text/event-stream; charset=utf-8';
            }
          });
        },
      },
    },
  },
});
