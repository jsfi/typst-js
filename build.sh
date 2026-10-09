#!/usr/bin/env bash
# Builds pkg/, ready for `npm publish` as @jsfi/typst-wasm: the wasm module, its ES module bindings,
# TypeScript types, Typst's default fonts in fonts/, the license files and a package.json.
set -euo pipefail

cd "$(dirname "$0")"
source scripts/toolchain.sh

out=pkg

# The build tools that shape the output, in the versions it is made with: the bindings generator
# has to match the wasm-bindgen crate exactly, and cargo-about is pinned here.
cargo_about=0.9.2
wasm_bindgen=$(locked_version wasm-bindgen)
require() { # require <command> <version> <install command>
  if [[ "$("$1" --version 2>/dev/null)" != "$1 $2" ]]; then
    echo "build.sh needs $1 $2: $3" >&2
    exit 1
  fi
}
require wasm-bindgen "$wasm_bindgen" "cargo install wasm-bindgen-cli --locked --version $wasm_bindgen"
require cargo-about "$cargo_about" "cargo install cargo-about --locked --features cli --version $cargo_about"

cargo build --release --locked --target wasm32-unknown-unknown

rm -rf "$out"
wasm-bindgen --target web --out-dir "$out" --out-name typst_wasm \
  target/wasm32-unknown-unknown/release/typst_wasm.wasm

wasm-opt -O3 --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext \
  --enable-mutable-globals --enable-reference-types --enable-multivalue \
  --output "$out/typst_wasm_bg.wasm" "$out/typst_wasm_bg.wasm"

# What the module is built from, read once: the package version is the crate's, the Typst version
# the locked typst crate's, and the crates compiled in are those of the wasm target.
metadata=target/wasm-metadata.json
cargo metadata --format-version 1 --locked --filter-platform wasm32-unknown-unknown > "$metadata"

cp packages/typst-wasm/README.md LICENSE "$out/"
cargo-about generate --locked --fail about.hbs --output-file "$out/THIRD_PARTY_LICENSES.md"
node scripts/assemble-package.mjs "$metadata" "$out"

ls -l "$out"
