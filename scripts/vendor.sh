#!/usr/bin/env bash
# Recreates vendor/ from the pristine crates on crates.io plus patches/.
# With --diff, writes the difference between vendor/ and the pristine crates back into patches/ instead.
set -euo pipefail

cd "$(dirname "$0")/.."
source scripts/toolchain.sh

crates=(krilla typst-pdf)

diff=""
for option in "$@"; do
  case "$option" in
    --diff) diff=1 ;;
    *) echo "usage: $0 [--diff]" >&2; exit 2 ;;
  esac
done

# Scratch space for this run: the downloaded crates, and the trees `--diff` compares.
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

# Where the crates.io index keeps the crate named $1, as its layout places names by their length.
index_path() {
  case ${#1} in
    1) echo "1/$1" ;;
    2) echo "2/$1" ;;
    3) echo "3/${1:0:1}/$1" ;;
    *) echo "${1:0:2}/${1:2:2}/$1" ;;
  esac
}

# The pristine source of the crate named $1 at the version Cargo.lock pins, downloaded from crates.io
# into the scratch space and checked against the checksum the index gives. Not kept in target/, which
# caches such as CI's restore in part, and not through Cargo:
# without vendor/, the [patch] in Cargo.toml keeps cargo from running at all, and `cargo metadata`
# resolves a patched crate to its vendored copy.
pristine_dir() {
  local name=$1 version dir checksum
  version=$(locked_version "$name")
  dir="$scratch/pristine/$name-$version"
  if [[ ! -d "$dir" ]]; then
    checksum=$(curl -sSfL "https://index.crates.io/$(index_path "$name")" \
      | grep -F "\"vers\":\"$version\"" | sed -E 's/.*"cksum":"([0-9a-f]{64})".*/\1/')
    if [[ ! "$checksum" =~ ^[0-9a-f]{64}$ ]]; then
      echo "vendor.sh: $name $version is not in the crates.io index" >&2
      exit 1
    fi
    mkdir -p "$scratch/pristine"
    curl -sSfL "https://static.crates.io/crates/$name/$name-$version.crate" -o "$dir.crate"
    if ! echo "$checksum  $dir.crate" | shasum -a 256 -c --status; then
      rm -f "$dir.crate"
      echo "vendor.sh: $name $version from crates.io does not match its checksum" >&2
      exit 1
    fi
    tar -xzf "$dir.crate" -C "$scratch/pristine"
    rm "$dir.crate"
  fi
  echo "$dir"
}

if [[ -n "$diff" ]]; then
  for crate in "${crates[@]}"; do
    # Both trees side by side as a/ and b/, so the patch carries paths relative to the crate.
    rm -rf "$scratch/a" "$scratch/b"
    pristine=$(pristine_dir "$crate")
    cp -R "$pristine" "$scratch/a"
    cp -R "vendor/$crate" "$scratch/b"
    # `git diff` exits with 1 when the trees differ and above 1 when it fails; a failure leaves the
    # patch as it was, since it is the only source of vendor/.
    status=0
    (cd "$scratch" && git diff --no-index --no-prefix --no-color --binary a b > "$scratch/patch") || status=$?
    case $status in
      0) rm -f "patches/$crate.patch" ;;
      1) mv "$scratch/patch" "patches/$crate.patch" ;;
      *) echo "vendor.sh: git diff failed for $crate; patches/$crate.patch is unchanged" >&2; exit 1 ;;
    esac
  done
  ls -l patches
  exit 0
fi

rm -rf vendor
mkdir vendor
for crate in "${crates[@]}"; do
  pristine=$(pristine_dir "$crate")
  cp -R "$pristine" "vendor/$crate"
  chmod -R u+w "vendor/$crate"
  if [[ -f "patches/$crate.patch" ]]; then
    git apply --directory="vendor/$crate" "patches/$crate.patch"
  fi
done
touch vendor/.applied
echo "vendor/ recreated"
