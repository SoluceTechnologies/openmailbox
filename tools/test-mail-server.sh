#!/usr/bin/env bash
# Starts a GreenMail server (IMAPS 3993, SMTPS 3465) whose certificate is signed by a local test CA.
# Builds with the `test-ca` Cargo feature trust that CA when OPENMAILBOX_TEST_CA holds its PEM.
set -euo pipefail

cd "$(dirname "$0")"
certificates=.test-certificates
container=openmailbox-greenmail

if [[ ! -f $certificates/server.p12 ]]; then
  mkdir -p "$certificates"
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=OpenMailbox Test CA" \
    -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -keyout "$certificates/ca.key" -out "$certificates/ca.pem" 2>/dev/null
  openssl req -newkey rsa:2048 -nodes -subj "/CN=localhost" \
    -keyout "$certificates/server.key" -out "$certificates/server.csr" 2>/dev/null
  printf 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:10.0.2.2\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' > "$certificates/server.ext"
  openssl x509 -req -in "$certificates/server.csr" -CA "$certificates/ca.pem" -CAkey "$certificates/ca.key" \
    -CAcreateserial -days 3650 -extfile "$certificates/server.ext" -out "$certificates/server.pem" 2>/dev/null
  openssl pkcs12 -export -inkey "$certificates/server.key" -in "$certificates/server.pem" -certfile "$certificates/ca.pem" \
    -name greenmail -passout pass:changeit -out "$certificates/server.p12"
  chmod 644 "$certificates/server.p12"
fi

docker rm -f "$container" >/dev/null 2>&1 || true
docker run -d --name "$container" \
  -p 3993:3993 -p 3465:3465 \
  -v "$PWD/$certificates/server.p12:/home/greenmail/greenmail.p12:ro" \
  -e GREENMAIL_OPTS="-Dgreenmail.setup.test.all -Dgreenmail.hostname=0.0.0.0 \
     -Dgreenmail.tls.keystore.file=/home/greenmail/greenmail.p12 -Dgreenmail.tls.keystore.password=changeit \
     -Dgreenmail.users=alice:secret@example.com,bob:secret@example.com -Dgreenmail.users.login=email" \
  greenmail/standalone:latest >/dev/null

echo "GreenMail running: IMAPS localhost:3993, SMTPS localhost:3465 (alice@example.com / secret)"
echo "export OPENMAILBOX_TEST_CA=\"\$(cat $PWD/$certificates/ca.pem)\""
