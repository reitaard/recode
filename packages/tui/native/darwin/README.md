# Darwin native helper

The optional Darwin addon reads modifier state through CoreGraphics. JavaScript rendering must continue to work when it is unavailable.

## Build directly

The current package manifest does **not** define `build:native:darwin`. Run the checked-in builder directly from the repository root on macOS:

```sh
bash packages/tui/native/darwin/build.sh
```

It produces:

```text
packages/tui/native/darwin/prebuilds/darwin-arm64/darwin-modifiers.node
packages/tui/native/darwin/prebuilds/darwin-x64/darwin-modifiers.node
```

On macOS the script locates Apple clang and the active SDK with `xcrun`. It targets macOS 11.0 for arm64 and macOS 10.15 for x64, and either host architecture can request both outputs.

A non-macOS build requires a complete licensed Darwin cross-toolchain, macOS SDK, Mach-O linker, and CoreGraphics framework stubs:

```sh
CC=/path/to/osxcross/clang \
SDKROOT=/path/to/MacOSX.sdk \
bash packages/tui/native/darwin/build.sh
```

Plain Linux/Windows clang is insufficient. Zig alone does not supply the Apple SDK or framework stubs.

## Certification gate

Before publication, rebuild from reviewed C source, record SDK/compiler versions and output hashes, inspect package contents, and smoke-test each output on its matching macOS architecture and supported Node version. Existing `.node` files are quarantined release candidates until that evidence exists.
