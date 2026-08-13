# Recode Packages

A Recode package distributes extensions, skills, prompts, and themes from npm, Git, URL/SSH Git, or local sources. Package installation executes package-manager and Git operations and may later load arbitrary extension code. Review and pin third-party sources.

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

Exact npm versions and Git refs are pinned. Bulk updates skip pinned sources. Offline mode suppresses package network operations but is not a sandbox. Custom `npmCommand` is an argv array and changes the executable trust boundary.

Do not publish package discovery commands or registry claims as stable until standalone package naming is approved. Package authors must put runtime dependencies in `dependencies`, compile examples against public imports, and test packed contents rather than relying on workspace resolution.
