# Recode Packages

Recode consumes packages from the existing Pi ecosystem; no separate Recode catalog is required. The `pi` compatibility command preserves upstream copy-and-paste installation syntax:

```text
pi install npm:pi-better-harness
pi install https://github.com/user/repository
pi list
pi update
```

A package distributes extensions, skills, prompts, and themes from npm, Git, URL/SSH Git, or local sources. Package installation executes package-manager and Git operations and may later load arbitrary extension code. Review and pin third-party sources. A global Recode `pi` command replaces or shadows an existing upstream `pi` executable.

## Sources and scopes

Package commands support user scope by default and project scope with `-l`. User installs live below the agent npm/git directories; project installs below `.pi/npm` or `.pi/git`. Sources can be persisted as strings or filtered objects in `settings.json`:

```json
{
  "packages": [{
    "source": "npm:@scope/example",
    "autoload": false,
    "extensions": ["extensions/review.js"],
    "skills": ["skills/**"]
  }]
}
```

Filters exist for extensions, skills, prompts, and themes. `autoload: false` starts with none until patterns enable resources. Project package settings and resources require trust.

## Package manifest

Packages may declare a compatibility `pi` manifest listing resource paths; conventional `extensions/`, `skills/`, `prompts/`, and `themes/` directories are otherwise discovered. This key remains a schema compatibility term. Compiled extension packages can declare runtime/readiness contracts; incompatible or unready artifacts are diagnosed and refused.

## Updating

Bare `pi update` updates installed compatible packages. Bare `recode update` targets the Recode application; `recode update --extensions` remains an explicit equivalent for package updates.

Exact npm versions and Git refs are pinned. Bulk updates skip pinned sources. Offline mode suppresses package network operations but is not a sandbox. Custom `npmCommand` is an argv array and changes the executable trust boundary.

Package authors must put runtime dependencies in `dependencies`, compile examples against public imports, and test packed contents rather than relying on workspace resolution. Recode maps supported `@mariozechner/pi-*` and `@earendil-works/pi-*` imports to its canonical runtime. Runtime-only aliases also keep existing installed extensions that import legacy `@reitaard/repi-*` entrypoints loadable; those aliases do not add predecessor packages to Recode's dependency graph or make those package identities install targets. Individual packages can still depend on unsupported APIs, so compatibility must be verified rather than inferred from catalog presence.
