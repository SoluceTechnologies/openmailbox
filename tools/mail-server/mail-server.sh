#!/usr/bin/env bash
# Local GreenMail server (IMAPS 3993, SMTPS 3465) for development and integration tests.
#
#   mail-server.sh start [--messages N]   start the server and seed the mailboxes
#   mail-server.sh seed [--messages N]    replace the seeded content of a running server
#   mail-server.sh performance [--messages N]
#                                         start a Dovecot IMAP server on port 3994, seeded with
#                                         a large inbox, for performance measurements
#   mail-server.sh oauth [--messages N]   start a Stalwart server (HTTPS 443, IMAPS 993, SMTPS 465)
#                                         that offers OAuth sign-in, with carol@example.com (empty),
#                                         alice@example.com and bob@example.com (seeded), all with
#                                         password "secret-password"; from the Android emulator, run
#                                         `adb reverse tcp:443 tcp:443` first (IMAP and SMTP
#                                         are reached at 10.0.2.2)
#   mail-server.sh stop                   stop and remove the containers
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
  chmod 644 "$certificates/server.p12" "$certificates/server.key"
}

wait_until_ready() {
  local container="$1" marker="$2"
  for _ in $(seq 1 60); do
    if docker logs "$container" 2>&1 | grep -q "$marker"; then
      return
    fi
    sleep 1
  done
  echo "The mail server did not start, see: docker logs $container" >&2
  exit 1
}

stalwart_api() {
  curl -sk --fail-with-body -u admin:openmailbox-admin -H 'Content-Type: application/json' \
    "https://localhost/jmap/" -d "{\"using\":[\"urn:ietf:params:jmap:core\",\"urn:stalwart:jmap\"],\"methodCalls\":[$1]}"
}

wait_for_stalwart() {
  for _ in $(seq 1 60); do
    if curl -sk -o /dev/null "$1"; then
      return
    fi
    sleep 1
  done
  echo "Stalwart did not start, see: docker logs openmailbox-stalwart" >&2
  exit 1
}

start_stalwart() {
  create_certificates
  docker compose -f "$root/compose.yaml" --profile oauth up -d --force-recreate --renew-anon-volumes stalwart >/dev/null
  wait_for_stalwart http://127.0.0.1:18080/
  if docker logs openmailbox-stalwart 2>&1 | grep -q "bootstrap mode"; then
    curl -s --fail-with-body -u admin:openmailbox-admin -H 'Content-Type: application/json' \
      "http://127.0.0.1:18080/jmap/" -d '{"using":["urn:ietf:params:jmap:core","urn:stalwart:jmap"],"methodCalls":[["x:Bootstrap/set",{"accountId":"d333333","update":{"singleton":{"defaultHostname":"localhost","defaultDomain":"example.com","requestTlsCertificate":false,"generateDkimKeys":false}}},"a"]]}' >/dev/null
    docker restart openmailbox-stalwart >/dev/null
  fi
  wait_for_stalwart https://localhost/.well-known/oauth-authorization-server
  local certificate key
  certificate="$(python3 -c 'import json,sys; print(json.dumps(open(sys.argv[1]).read()))' "$certificates/server.pem")"
  key="$(python3 -c 'import json,sys; print(json.dumps(open(sys.argv[1]).read()))' "$certificates/server.key")"
  stalwart_api "[\"x:Certificate/set\",{\"accountId\":\"d333333\",\"create\":{\"test\":{\"certificate\":{\"@type\":\"Text\",\"value\":$certificate},\"privateKey\":{\"@type\":\"Text\",\"secret\":$key}}}},\"c\"],[\"x:SystemSettings/set\",{\"accountId\":\"d333333\",\"update\":{\"singleton\":{\"defaultCertificateId\":\"#test\"}}},\"s\"],[\"x:Account/set\",{\"accountId\":\"d333333\",\"create\":{\"carol\":{\"@type\":\"User\",\"name\":\"carol\",\"domainId\":\"b\",\"credentials\":{\"0\":{\"@type\":\"Password\",\"secret\":\"secret-password\"}}},\"alice\":{\"@type\":\"User\",\"name\":\"alice\",\"domainId\":\"b\",\"credentials\":{\"0\":{\"@type\":\"Password\",\"secret\":\"secret-password\"}}},\"bob\":{\"@type\":\"User\",\"name\":\"bob\",\"domainId\":\"b\",\"credentials\":{\"0\":{\"@type\":\"Password\",\"secret\":\"secret-password\"}}}}},\"u\"]" >/dev/null
  docker restart openmailbox-stalwart >/dev/null
  wait_for_stalwart https://localhost/.well-known/oauth-authorization-server
  curl -s --cacert "$certificates/ca.pem" -o /dev/null https://localhost/.well-known/oauth-authorization-server
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
    wait_until_ready openmailbox-mail "Starting GreenMail API"
    seed "$@"
    echo "Mail server ready: IMAPS localhost:3993, SMTPS localhost:3465 (alice@example.com / secret)"
    echo "From the Android emulator, use the host 10.0.2.2."
    ;;
  seed)
    seed --reset "$@"
    ;;
  performance)
    create_certificates
    docker compose -f "$root/compose.yaml" --profile performance up -d --force-recreate performance-imap >/dev/null
    wait_until_ready openmailbox-performance-imap "starting up for imap"
    seed --port 3994 --reset --messages 10000 "$@"
    echo "Dovecot ready on IMAPS localhost:3994 (alice@example.com / secret)"
    ;;
  oauth)
    start_stalwart
    seed --port 993 --password secret-password "$@"
    echo "Stalwart ready: https://localhost, IMAPS localhost:993, SMTPS localhost:465 (carol, alice and bob @example.com / secret-password)"
    echo "From the Android emulator: adb reverse tcp:443 tcp:443 (IMAP and SMTP at 10.0.2.2)"
    ;;
  stop)
    docker compose -f "$root/compose.yaml" --profile performance --profile oauth down >/dev/null
    ;;
  status)
    docker ps --filter name=openmailbox- --format '{{.Names}}: {{.Status}}'
    ;;
  *)
    echo "Unknown command: $command (start, seed, performance, oauth, stop, status)" >&2
    exit 1
    ;;
esac
