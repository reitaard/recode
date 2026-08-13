# Themes

Coding-agent owns theme discovery and selection; `@reitaard/recode-tui` owns terminal color/rendering behavior.

Built-in themes currently include dark and light assets. Additional JSON themes can be loaded from user/project compatibility directories, packages, explicit `--theme` paths, or settings. Project themes are trust-gated even though they are declarative data. `--no-themes` disables default discovery; explicit paths remain an intentional input.

Use `/settings` or the `theme` setting to select a loaded theme. Theme diagnostics report invalid files and collisions. Do not depend on private renderer modules or undocumented color keys; the schema must be verified against the transferred loader and TUI contract before publication.

Accessibility requirements for contributed themes include readable foreground/background contrast, distinguishable error/warning/success states, and useful behavior in terminals with limited color support. Screenshots alone are not certification.
