#!/usr/bin/env bash
# Generate self-signed origin + AOP CA/client certs for local M2 Nginx smoke tests.
# Never use these certificates in real staging/production (Cloudflare Origin Certs belong there).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_DIR="${ROOT_DIR}/infra/vps/certs/dev"
DAYS=825

mkdir -p "${CERT_DIR}"

openssl req -x509 -newkey rsa:2048 -nodes -days "${DAYS}" \
  -keyout "${CERT_DIR}/aop-ca.key" \
  -out "${CERT_DIR}/aop-ca.pem" \
  -subj "/CN=SoloCamiones Dev AOP CA"

openssl req -newkey rsa:2048 -nodes \
  -keyout "${CERT_DIR}/origin.key" \
  -out "${CERT_DIR}/origin.csr" \
  -subj "/CN=localhost"

openssl x509 -req -in "${CERT_DIR}/origin.csr" -days "${DAYS}" \
  -signkey "${CERT_DIR}/origin.key" \
  -out "${CERT_DIR}/origin.pem"

# Client certificate trusted by the AOP CA (for curl --cert smoke against the edge).
openssl req -newkey rsa:2048 -nodes \
  -keyout "${CERT_DIR}/aop-client.key" \
  -out "${CERT_DIR}/aop-client.csr" \
  -subj "/CN=cloudflare-aop-smoke-client"

openssl x509 -req -in "${CERT_DIR}/aop-client.csr" -days "${DAYS}" \
  -CA "${CERT_DIR}/aop-ca.pem" -CAkey "${CERT_DIR}/aop-ca.key" -CAcreateserial \
  -out "${CERT_DIR}/aop-client.pem"

rm -f "${CERT_DIR}/origin.csr" "${CERT_DIR}/aop-client.csr" "${CERT_DIR}/aop-ca.srl"

chmod 600 "${CERT_DIR}/origin.key" "${CERT_DIR}/aop-ca.key" "${CERT_DIR}/aop-client.key"
chmod 644 "${CERT_DIR}/origin.pem" "${CERT_DIR}/aop-ca.pem" "${CERT_DIR}/aop-client.pem"

echo "Wrote smoke certs to ${CERT_DIR}"
echo "Use aop-client.pem / aop-client.key with curl --cert/--key against https://localhost"
