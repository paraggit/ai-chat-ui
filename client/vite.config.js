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
      },
    },
  },
});
