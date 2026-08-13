# `@reitaard/recode-tui`

Terminal UI primitives and differential renderers used by Recode. Node `>=22.19.0` is required.

> Source and manifest are present under the standalone `0.1.0` identity. Installation, build, tests, native certification, packing, and publication remain uncertified. Quarantined native addons were not transferred.

## Choose a renderer

`TUI` is an interface, not a constructible class.

- `TuiMainScreen` renders into the terminal's regular screen and preserves scrollback.
- `TuiAltScreen` owns a fullscreen viewport, mouse interaction, selection, scroll views, overlays, and alternate-screen lifecycle.

```ts
import {
  ProcessTerminal,
  Text,
  TuiMainScreen,
  type TUI,
} from "@reitaard/recode-tui";

const ui: TUI = new TuiMainScreen(new ProcessTerminal());
ui.addChild(new Text("Hello from Recode", 0, 0));
ui.start();
```

For fullscreen rendering:

```ts
import { ProcessTerminal, TuiAltScreen } from "@reitaard/recode-tui";

const ui = new TuiAltScreen(new ProcessTerminal(), false, undefined, {
  wheelScrollLines: 3,
});
ui.start();
```

Compile examples against the transferred source before release; component constructor details remain owned by exported types.

## UI and layout surface

The root entry point exports:

- components including `Box`, `Text`, `TruncatedText`, `Input`, `Editor`, `Markdown`, `Image`, loaders, lists, settings, and spacers;
- layout containers `VStack`, `HStack`, and `ScrollView`;
- autocomplete, fuzzy matching, keybindings, key parsing, LaTeX rendering, and stdin buffering;
- overlays, focusable components, viewport detection, composition utilities, and renderer-state handoff types;
- terminal image capability detection and Kitty/iTerm image encoders;
- ANSI-aware width, wrapping, slicing, truncation, and hyperlink utilities;
- bounded diagnostic writing.

Both renderers consume `Component` trees. Main-screen rendering optimizes changed terminal lines and scrollback. Alternate-screen rendering builds viewport layout, handles wheel/scrollbar interaction and application-owned selection, and can cache bounded offscreen Kitty images.

Use exported containers and renderer methods rather than package-private layout internals.

## Terminal contract

`ProcessTerminal` is the real stdin/stdout implementation of `Terminal`. Custom terminal adapters must implement:

- `start`/`stop` and `drainInput`;
- terminal dimensions and output writes;
- cursor movement/visibility and clear operations;
- title and progress operations;
- Kitty protocol state and optional keyboard-protocol status.

`ProcessTerminal` enables raw input and bracketed paste, handles resize, negotiates Kitty keyboard protocol with `modifyOtherKeys` fallback, buffers input sequences, drains release events during shutdown, and restores terminal state.

The exported `REPI_TERMINAL_BINDING_SEQUENCES` name is a compatibility API identifier. `PI_TUI_WRITE_LOG`, `PI_CODING_AGENT_DIR`, and other `PI_*` values found in source are compatibility environment names, not product identity.

## Input, images, and fallback

Keyboard helpers parse press/repeat/release events and track Kitty protocol state. Native modifier detection can recover Shift+Enter in supported Apple Terminal and Windows console paths.

Image helpers detect terminal support and render Kitty or iTerm2 data when available. Callers must provide a text fallback. Width utilities operate on terminal cells and preserve relevant ANSI/OSC sequences.

Optional native helpers fail soft; the JavaScript renderer remains usable when a helper cannot be loaded.

## Diagnostics

`writeTuiDiagnostic()` and renderer diagnostic options produce bounded troubleshooting records. Terminal writes can be captured with `ProcessTerminal({ writeLogPath })` or the compatibility `PI_TUI_WRITE_LOG` environment variable. Logs may contain rendered application content; treat them as sensitive and keep them out of source control.

## Native helpers

The source contains optional helpers for:

- Windows virtual-terminal input and modifier state;
- Darwin modifier state through CoreGraphics.

The current package manifest deliberately excludes native prebuilds. JavaScript fallback is therefore the only certifiable package behavior until reviewed source is reproducibly rebuilt and smoke-tested on Windows x64/arm64 and Darwin x64/arm64. See the platform guides:

- [`native/win32/README.md`](native/win32/README.md)
- [`native/darwin/README.md`](native/darwin/README.md)

## Build and test

After root workspace infrastructure and dependencies are transferred:

```sh
npm run build -w @reitaard/recode-tui
npm test -w @reitaard/recode-tui
```

The declared test command uses Node's test runner over `test/*.test.ts`. Executable demos and diagnostic reproducers are not tests unless matched by that command. The audited upstream checkpoint at `fbd6b5b3` passed 52 suites and 878 tests; native rebuild and cross-platform execution were not run.
