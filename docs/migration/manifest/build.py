#!/usr/bin/env python3
"""Generate the migration-only exact transfer ledger from a re.pi git tree."""
from pathlib import Path
import subprocess

SOURCE = Path(__file__).resolve().parents[4] / "re.pi"
OUT = Path(__file__).with_name("transfer.tsv")
COMMIT = "fbd6b5b3a494d6c50bc5415eb3be2e4366470056"
PACKAGES = ("agent", "ai", "coding-agent", "orchestrator", "telemetry", "tui")
ROOT_TRANSFER = {
    ".gitattributes", ".gitignore", ".npmrc", "biome.json", "LICENSE",
    "package.json", "package-lock.json", "SECURITY.md", "test.sh",
    "tsconfig.base.json", "tsconfig.json",
}
ROOT_REWRITE = {".gitignore", ".npmrc", "package.json", "package-lock.json", "SECURITY.md", "test.sh", "tsconfig.json"}
SCRIPT_EXCLUDE = {
    "check-lockfile-commit.mjs", "cost.ts", "edit-tool-stats.mjs", "read-tool-stats.mjs",
    "repro-5893-wsl-bash.mjs", "session-context-stats.mjs", "session-transcripts.ts",
    "stats.ts", "tool-stats.ts", "update-source-imports-to-ts.sh",
}
SCRIPT_CONDITIONAL = {
    "generate-coding-agent-install-lock.mjs", "publish-release-announcement.mjs",
    "publish-release-announcement.test.mjs", "release-notes.mjs",
}
AGENT_DOC_TRANSFER = {"README.md", "docs/agent-harness.md", "docs/telemetry-schema.md"}
AGENT_DOC_EXCLUDE = {
    "docs/durable-harness.md", "docs/harness-v2.md", "docs/harness-v2-test-matrix.md",
    "docs/hooks.md", "docs/models.md", "docs/observability.md",
}
EXAMPLE_EXCLUDE_PARTS = (
    "/subagent/", "/doom-overlay/",
)
EXAMPLE_EXCLUDE_FILES = {
    "auto-commit-on-exit.ts", "git-merge-and-resolve.ts", "snake.ts", "space-invaders.ts",
    "tic-tac-toe.ts", "overlay-qa-tests.ts", "working-message-test.ts",
}
EXAMPLE_CONDITIONAL = {
    "ssh.ts", "interactive-shell.ts", "notify.ts", "mac-system-theme.ts",
    "github-issue-autocomplete.ts",
}

def classify(path: str) -> tuple[str, str]:
    if path in ROOT_TRANSFER:
        return ("rewrite" if path in ROOT_REWRITE else "transfer", "root build/policy input")
    if "/dist/" in f"/{path}/" or "/binaries/" in f"/{path}/" or "/node_modules/" in f"/{path}/":
        return "regenerate", "generated/copied output"
    if path.startswith("scripts/"):
        rel = path.removeprefix("scripts/")
        if rel in SCRIPT_EXCLUDE:
            return "exclude", "personal, one-off, or unwired helper"
        if rel in SCRIPT_CONDITIONAL:
            return "quarantine", "conditional release facility pending policy"
        return "rewrite", "active build/check/release helper; identity and safety review required"
    if path == ".github/workflows/ci.yml" or path == ".github/workflows/npm-audit.yml":
        return "rewrite", "inactive until deterministic pinned workflow rewrite"
    if path == ".github/workflows/build-binaries.yml":
        return "quarantine", "remote publication workflow; keep outside active trigger path"
    if path == ".github/RELEASE_NOTES.md":
        return "quarantine", "release input pending rewrite"
    if path.startswith(".github/"):
        return "exclude", "inherited governance/support metadata"
    if path.startswith("packages/storage/sqlite-node/"):
        rel = path.removeprefix("packages/storage/sqlite-node/")
        return ("rewrite" if rel in {"README.md", "package.json"} else "transfer", "approved optional SQLite package")
    if path.startswith("packages/"):
        parts = path.split("/")
        if len(parts) < 3 or parts[1] not in PACKAGES:
            return "exclude", "outside approved release-path package set"
        pkg, rel = parts[1], "/".join(parts[2:])
        if pkg == "agent":
            if rel in AGENT_DOC_EXCLUDE:
                return "exclude", "superseded design/migration documentation"
            if rel in AGENT_DOC_TRANSFER:
                return "rewrite", "canonical package documentation"
        if pkg == "coding-agent":
            if rel == "docs/docs.json":
                return "exclude", "docs-site configuration not adopted"
            if rel in {"src/server/create-harness.ts", "test/server/create-harness.test.ts"}:
                return "exclude", "unexported broken AgentHarness.create port"
            if rel.startswith("install-lock/"):
                return "quarantine", "conditional release artifact"
            if rel == "scripts/migrate-sessions.sh":
                return "exclude", "obsolete duplicated Unix migration helper"
            if rel.startswith("docs/") or rel == "README.md":
                if rel.startswith("docs/images/"):
                    return "exclude", "stale inherited screenshot"
                return "rewrite", "coding-agent documentation requires Recode rewrite"
            if rel.startswith("examples/"):
                if any(part in f"/{rel}/" for part in EXAMPLE_EXCLUDE_PARTS) or Path(rel).name in EXAMPLE_EXCLUDE_FILES:
                    return "exclude", "obsolete, unsafe, generated, or redundant example"
                if any(seg in f"/{rel}/" for seg in ("/gondolin/", "/sandbox/")) or Path(rel).name in EXAMPLE_CONDITIONAL or "custom-provider" in rel:
                    return "quarantine", "external/platform example pending certification"
                if Path(rel).name == "package-lock.json":
                    return "regenerate", "retained example lock must be regenerated"
                return "rewrite", "candidate maintained example; identity/API review required"
        if pkg == "tui" and "/prebuilds/" in f"/{rel}/" and rel.endswith(".node"):
            return "quarantine", "native binary pending provenance/rebuild certification"
        if rel == "README.md" or rel.startswith("docs/") or rel.endswith("/README.md"):
            return "rewrite", "package documentation rewrite"
        if rel == "package.json":
            return "rewrite", "package identity/build/publication review"
        return "transfer", "approved package source/test/build input"
    if path.startswith(("Analyze/", "docs/", "update/", "n8n-workspace/", ".agents/", ".husky/", ".pi/", "repi/")):
        return "exclude", "historical, local, separate, or inherited repository material"
    return "exclude", "not in approved standalone transfer boundary"

def main() -> None:
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=SOURCE, text=True).strip()
    if head != COMMIT:
        raise SystemExit(f"source HEAD {head} != certified {COMMIT}")
    paths = subprocess.check_output(["git", "ls-files"], cwd=SOURCE, text=True).splitlines()
    rows = [(p, *classify(p)) for p in paths]
    counts: dict[str, int] = {}
    for _, disposition, _ in rows:
        counts[disposition] = counts.get(disposition, 0) + 1
    with OUT.open("w", encoding="utf-8", newline="\n") as f:
        f.write(f"# source\t../re.pi@{COMMIT}\n")
        f.write("# generated-by\tdocs/migration/manifest/build.py\n")
        f.write("path\tdisposition\treason\n")
        for path, disposition, reason in rows:
            f.write(f"{path}\t{disposition}\t{reason}\n")
    print(f"wrote {len(rows)} rows to {OUT}")
    print(" ".join(f"{k}={v}" for k, v in sorted(counts.items())))

if __name__ == "__main__":
    main()
