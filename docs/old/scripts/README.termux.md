# Recode for Termux

Requires Node.js 22.19 or newer. Install the runtime tools, extract this archive,
and run Recode:

```sh
pkg install nodejs-lts git bash ripgrep fd
tar -xzf recode-termux-node.tar.gz
./recode/install
./recode/recode
```

The installer resolves runtime dependencies with npm while keeping the four
versioned Recode packages from this release. It excludes native clipboard
bindings because Android uses Bionic libc, so clipboard integration falls back
to terminal-supported methods.
