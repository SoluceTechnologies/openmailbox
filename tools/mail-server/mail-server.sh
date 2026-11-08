#!/usr/bin/env bash
# Local GreenMail server (IMAPS 3993, SMTPS 3465) for development and integration tests.
#
#   mail-server.sh start [--messages N]   start the server and seed the mailboxes
#   mail-server.sh seed [--messages N]    replace the seeded content of a running server
#   mail-server.sh stop                   stop and remove the container
#   mail-server.sh status                 show whether the server is running
#
# The certificate is signed by a local CA kept in tools/mail-server/.certificates.
# Builds made with `tools/build-core.sh <platform> --test-ca` trust that CA.
# Accounts: alice@example.com and bob@example.com, password "secret".
set -euo pipefail

directory="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$directory/../.." && pwd)"
certificates="$directory/.certificates"

create_certificates() {
  [[ -f $certificates/server.p12 ]] && return
  mkdir -p "$certificates"
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=OpenMailbox Test CA" \
    -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -keyout "$certificates/ca.key" -out "$certificates/ca.pem" 2>/dev/null
  openssl req -newkey rsa:2048 -nodes -subj "/CN=localhost" \
    -keyout "$certificates/server.key" -out "$certificates/server.csr" 2>/dev/null
  printf 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:10.0.2.2\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' \
    > "$certificates/server.ext"
  openssl x509 -req -in "$certificates/server.csr" -CA "$certificates/ca.pem" -CAkey "$certificates/ca.key" \
    -CAcreateserial -days 3650 -extfile "$certificates/server.ext" -out "$certificates/server.pem" 2>/dev/null
  openssl pkcs12 -export -inkey "$certificates/server.key" -in "$certificates/server.pem" \
    -certfile "$certificates/ca.pem" -name greenmail -passout pass:changeit -out "$certificates/server.p12"
  chmod 644 "$certificates/server.p12"
}

wait_until_ready() {
  for _ in $(seq 1 60); do
    if docker logs openmailbox-mail 2>&1 | grep -q "Starting GreenMail API"; then
      return
    fi
    sleep 1
  done
  echo "The mail server did not start, see: docker logs openmailbox-mail" >&2
  exit 1
}

seed() {
  node "$directory/seed.mjs" --ca "$certificates/ca.pem" "$@"
}

command="${1:-start}"
shift || true

case "$command" in
  start)
    create_certificates
    docker compose -f "$root/compose.yaml" up -d --force-recreate mail >/dev/null
    wait_until_ready
    seed "$@"
    echo "Mail server ready: IMAPS localhost:3993, SMTPS localhost:3465 (alice@example.com / secret)"
    echo "From the Android emulator, use the host 10.0.2.2."
    ;;
  seed)
    seed --reset "$@"
    ;;
  stop)
    docker compose -f "$root/compose.yaml" down >/dev/null
    ;;
  status)
    docker ps --filter name=openmailbox-mail --format '{{.Names}}: {{.Status}}'
    ;;
  *)
    echo "Unknown command: $command (start, seed, stop, status)" >&2
    exit 1
    ;;
esac
