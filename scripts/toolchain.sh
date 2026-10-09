# Sourced by build.sh, vendor.sh and cargo.sh in scripts/: puts rustup's cargo, which honors
# rust-toolchain.toml, ahead of any other. Homebrew installs rustup keg-only, outside the PATH; the
# rustup installer puts it in ~/.cargo/bin, where `cargo install` puts wasm-bindgen and cargo-about
# as well.
for directory in "$HOME/.cargo/bin" /usr/local/opt/rustup/bin /opt/homebrew/opt/rustup/bin; do
  if [[ -d "$directory" ]]; then
    PATH="$directory:$PATH"
  fi
done
export PATH

# The version Cargo.lock pins for the crate named $1, read from the repository root.
locked_version() {
  awk -v name="$1" '$0 == "name = \"" name "\"" { getline; gsub(/version = |"/, ""); print; exit }' Cargo.lock
}
