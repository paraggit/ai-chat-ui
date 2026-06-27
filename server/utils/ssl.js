import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_KEY = path.join(__dirname, '../../certs/key.pem');
const DEFAULT_CERT = path.join(__dirname, '../../certs/cert.pem');

/**
 * @returns {boolean}
 */
export function isSSLEnabled() {
  return process.env.SSL_ENABLED === 'true';
}

/**
 * @returns {{ key: Buffer, cert: Buffer } | null}
 */
export function loadSSLOptions() {
  if (!isSSLEnabled()) {
    return null;
  }

  const keyPath = process.env.SSL_KEY_PATH || DEFAULT_KEY;
  const certPath = process.env.SSL_CERT_PATH || DEFAULT_CERT;

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    throw new Error(
      `SSL is enabled but certificate files are missing.\n` +
        `  key:  ${keyPath}\n` +
        `  cert: ${certPath}\n` +
        `Run: npm run certs:generate`
    );
  }

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
}

/**
 * @returns {string}
 */
export function getServerProtocol() {
  return isSSLEnabled() ? 'https' : 'http';
}
