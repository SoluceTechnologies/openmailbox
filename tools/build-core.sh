#!/usr/bin/env bash
# Builds the Rust core for one platform and regenerates the React Native bindings.
# Usage: tools/build-core.sh android|ios [--release]
# --test-ca trusts the CA of the local mail server (tools/mail-server/mail-server.sh). Never ship such a build.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
platform="${1:?android or ios}"
shift

toolchain="$(sed -n 's/^channel = "\(.*\)"/\1/p' "$root/core/rust-toolchain.toml")"
export RUSTUP_TOOLCHAIN="$toolchain"

config=ubrn.config.yaml
arguments=()
for argument in "$@"; do
  case "$argument" in
    --test-ca)
      config=ubrn.test.config.yaml
      if [[ -z ${OPENMAILBOX_TEST_CA:-} ]]; then
        OPENMAILBOX_TEST_CA="$(cat "$root/tools/mail-server/.certificates/ca.pem")"
        export OPENMAILBOX_TEST_CA
      fi
      ;;
    *) arguments+=("$argument") ;;
  esac
done

if [[ $platform == android ]]; then
  export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
  if [[ -z ${ANDROID_NDK_HOME:-} ]]; then
    ANDROID_NDK_HOME="$(ls -d "$ANDROID_HOME"/ndk/27.* 2>/dev/null | sort -V | tail -1)"
    export ANDROID_NDK_HOME
  fi
fi

cd "$root/modules/mail-core"
"$root/node_modules/.bin/ubrn" build "$platform" --config "$config" --and-generate "${arguments[@]}"
