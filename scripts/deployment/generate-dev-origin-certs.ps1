# Generate self-signed origin + AOP CA/client certs for local M2 Nginx smoke tests.
# Uses Alpine+OpenSSL in Docker so Windows hosts without OpenSSL still work.
# Never use these certificates in real staging/production.

$ErrorActionPreference = 'Stop'

$RootDir = Resolve-Path (Join-Path $PSScriptRoot '../..')
$CertDir = Join-Path $RootDir 'infra/vps/certs/dev'
New-Item -ItemType Directory -Force -Path $CertDir | Out-Null

$ScriptPath = Join-Path $CertDir '_generate.sh'
$UnixScript = @'
#!/bin/sh
set -eu
cd /certs
DAYS=825
apk add --no-cache openssl >/dev/null

openssl req -x509 -newkey rsa:2048 -nodes -days "$DAYS" \
  -keyout aop-ca.key \
  -out aop-ca.pem \
  -subj "/CN=SoloCamiones Dev AOP CA"

openssl req -newkey rsa:2048 -nodes \
  -keyout origin.key \
  -out origin.csr \
  -subj "/CN=localhost"

openssl x509 -req -in origin.csr -days "$DAYS" \
  -signkey origin.key \
  -out origin.pem

openssl req -newkey rsa:2048 -nodes \
  -keyout aop-client.key \
  -out aop-client.csr \
  -subj "/CN=cloudflare-aop-smoke-client"

openssl x509 -req -in aop-client.csr -days "$DAYS" \
  -CA aop-ca.pem -CAkey aop-ca.key -CAcreateserial \
  -out aop-client.pem

rm -f origin.csr aop-client.csr aop-ca.srl _generate.sh
chmod 600 origin.key aop-ca.key aop-client.key
chmod 644 origin.pem aop-ca.pem aop-client.pem
'@
[System.IO.File]::WriteAllText($ScriptPath, ($UnixScript -replace "`r`n", "`n"))

docker run --rm -v "${CertDir}:/certs" alpine:3.20 sh /certs/_generate.sh

Write-Host "Wrote smoke certs to $CertDir"
