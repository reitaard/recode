# Windows native helper

The optional Windows addon enables virtual-terminal console input and reads modifier state. JavaScript rendering must continue to work when it is unavailable.

## Build directly

The current package manifest does **not** define `build:native:win32`. Run the checked-in builder directly from the repository root:

```sh
node packages/tui/native/win32/build.mjs
```

It produces:

```text
packages/tui/native/win32/prebuilds/win32-x64/win32-console-mode.node
packages/tui/native/win32/prebuilds/win32-arm64/win32-console-mode.node
```

On Windows, the builder locates Visual Studio 2022 Build Tools and initializes MSVC for x64 and arm64. Install the C++ toolset and Windows SDK. The addon resolves N-API symbols from the host and links only `kernel32`; no downloaded Node headers are required.

For MinGW-compatible cross-compilers:

```sh
PI_TUI_WIN32_TOOLCHAIN=mingw \
CC_X64=/path/to/x86_64-w64-mingw32-gcc \
CC_ARM64=/path/to/aarch64-w64-mingw32-gcc \
node packages/tui/native/win32/build.mjs
```

`CC` may instead select a clang driver that accepts the builder's Windows target flag. `PI_TUI_WIN32_TOOLCHAIN` is a retained compatibility environment name.

## Certification gate

Before publication, rebuild from reviewed C source, record toolchain versions and output hashes, inspect the package contents, and smoke-test each output on its matching Windows architecture and supported Node version. Existing `.node` files are quarantined release candidates until that evidence exists.
