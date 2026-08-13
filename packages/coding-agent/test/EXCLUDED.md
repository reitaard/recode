# Excluded Tests

The standalone coding-agent suite excludes four inherited tests whose required implementation is outside the approved seven-package boundary.

- `git-merge-and-resolve-extension.test.ts` requires `examples/extensions/git-merge-and-resolve.ts`. The migration manifest excludes that obsolete and unsafe example.
- `client/remote-session-lifecycle.test.ts`
- `client/remote-session-ownership.test.ts`
- `client/remote-session.test.ts`

The three client suites require `@reitaard/repi-client`. The complete client package is explicitly excluded from the initial standalone workspace.

These exclusions do not waive failures in transferred code. Restoring them requires a separately approved client-package slice or a deliberate replacement design.
