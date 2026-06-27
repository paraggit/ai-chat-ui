#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="${ROOT_DIR}/certs"
KEY_FILE="${CERT_DIR}/key.pem"
CERT_FILE="${CERT_DIR}/cert.pem"
DAYS="${SSL_CERT_DAYS:-365}"

mkdir -p "${CERT_DIR}"

if [[ -f "${KEY_FILE}" && -f "${CERT_FILE}" ]]; then
  echo "Certificates already exist at ${CERT_DIR}"
  echo "  key:  ${KEY_FILE}"
  echo "  cert: ${CERT_FILE}"
  echo "Delete them first to regenerate."
  exit 0
fi

echo "Generating self-signed SSL certificate (valid ${DAYS} days)..."

openssl req -x509 -newkey rsa:4096 \
  -keyout "${KEY_FILE}" \
  -out "${CERT_FILE}" \
  -days "${DAYS}" \
  -nodes \
  -subj "/CN=localhost/O=HF Chat Pro/C=US" \
  -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:::1"

chmod 600 "${KEY_FILE}"
chmod 644 "${CERT_FILE}"

echo ""
echo "Self-signed certificates created:"
echo "  ${KEY_FILE}"
echo "  ${CERT_FILE}"
echo ""
echo "Start with HTTPS:"
echo "  npm run dev:ssl"
