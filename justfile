# Local mail servers in Docker, for development and integration tests.
# TLS certificates are signed by the local CA in tools/mail-server/.certificates/ca.pem:
# build the core with `yarn core:ios:dev` or `yarn core:android:dev` (--test-ca) to trust it.
# From the Android emulator, the host is 10.0.2.2.

mail := "tools/mail-server/mail-server.sh"

default:
    @just --list

# GreenMail
#   IMAPS localhost:3993, SMTPS localhost:3465
#   alice@example.com / secret, bob@example.com / secret, seeded with demo mail
#   more mail: `just greenmail --messages 500`
[doc("GreenMail: IMAPS 3993, SMTPS 3465 - alice, bob @example.com / secret")]
greenmail *args:
    {{mail}} start {{args}}

# Stalwart, with OAuth sign-in
#   HTTPS https://localhost, IMAPS localhost:993, SMTPS localhost:465
#   carol@example.com / secret-password, empty mailbox
#   alice@example.com / secret-password, bob@example.com / secret-password, seeded with demo mail
#   (Stalwart refuses passwords shorter than 8 characters)
#   admin panel http://127.0.0.1:18080, admin / openmailbox-admin
#   Android emulator: run `adb reverse tcp:443 tcp:443` first
[doc("Stalwart: HTTPS 443, IMAPS 993, SMTPS 465 - carol, alice, bob @example.com / secret-password")]
stalwart *args:
    {{mail}} oauth {{args}}

# Dovecot, for performance measurements
#   IMAPS localhost:3994
#   alice@example.com / secret, bob@example.com / secret, alice's inbox seeded with 10,000 messages
[doc("Dovecot: IMAPS 3994 - alice, bob @example.com / secret, 10,000 messages")]
dovecot *args:
    {{mail}} performance {{args}}

# Replace the demo mail of a running server
#   GreenMail: `just seed`
#   Stalwart:  `just seed --port 993 --password secret-password`
[doc("Replace demo mail: GreenMail by default, Stalwart with --port 993 --password secret-password")]
seed *args:
    {{mail}} seed {{args}}

[doc("Show which servers are running")]
status:
    @{{mail}} status

[doc("Stop and remove every server")]
stop:
    {{mail}} stop
