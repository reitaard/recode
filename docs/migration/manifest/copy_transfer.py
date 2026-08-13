#!/usr/bin/env python3
"""Dry-run or copy only `transfer` rows from the approved migration ledger."""
from __future__ import annotations

import argparse
import csv
import hashlib
from pathlib import Path
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
DESTINATION = HERE.parents[2]
SOURCE = HERE.parents[3] / "re.pi"
LEDGER = HERE / "transfer.tsv"
EXPECTED_SOURCE_COMMIT = "fbd6b5b3a494d6c50bc5415eb3be2e4366470056"
EXPECTED_LEDGER_SHA256 = "f208a4b67fba6174abc462ff72e8e3accd10335065babb1c1ebbc12cb98aab5b"
EXPECTED_TRANSFER_ROWS = 1243
APPROVED_PHASES = {
    "coding-agent": ("packages/coding-agent/", 615),
    "telemetry": ("packages/telemetry/", 10),
    "ai": ("packages/ai/", 370),
    "agent": ("packages/agent/", 97),
}


def git_output(repo: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=repo, text=True).strip()


def require_clean(repo: Path, label: str) -> None:
    status = git_output(repo, "status", "--short")
    if status:
        raise SystemExit(f"{label} repository is not clean")


def ledger_hash() -> str:
    return hashlib.sha256(LEDGER.read_bytes()).hexdigest()


def transfer_paths(prefix: str | None = None) -> list[str]:
    paths: list[str] = []
    with LEDGER.open(encoding="utf-8", newline="") as stream:
        rows = (line for line in stream if not line.startswith("#"))
        for row in csv.DictReader(rows, delimiter="\t"):
            if row["disposition"] == "transfer" and (prefix is None or row["path"].startswith(prefix)):
                paths.append(row["path"])
    expected = EXPECTED_TRANSFER_ROWS if prefix is None else next(
        count for approved_prefix, count in APPROVED_PHASES.values() if approved_prefix == prefix
    )
    if len(paths) != expected or len(paths) != len(set(paths)):
        raise SystemExit(f"expected {expected} unique transfer rows for {prefix or 'full ledger'}, found {len(paths)}")
    return paths


def safe_path(root: Path, relative: str) -> Path:
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError as error:
        raise SystemExit(f"ledger path escapes repository root: {relative}") from error
    return candidate


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="perform the approved copy; default is dry-run")
    parser.add_argument(
        "--phase",
        choices=sorted(APPROVED_PHASES),
        help="restrict processing to one reviewed transfer phase; required for --apply",
    )
    parser.add_argument(
        "--allow-existing-identical",
        action="store_true",
        help="permit a destination file only when its bytes already equal the source",
    )
    parser.add_argument(
        "--allow-existing",
        action="append",
        default=[],
        metavar="PATH",
        help="permit one reviewed existing destination path without overwriting it",
    )
    args = parser.parse_args()
    if args.apply and not args.phase:
        raise SystemExit("--apply requires an explicitly approved --phase; bulk apply is forbidden")
    allowed_existing = set(args.allow_existing)
    prefix = APPROVED_PHASES[args.phase][0] if args.phase else None

    if git_output(SOURCE, "rev-parse", "HEAD") != EXPECTED_SOURCE_COMMIT:
        raise SystemExit("source HEAD does not match the approved checkpoint")
    if ledger_hash() != EXPECTED_LEDGER_SHA256:
        raise SystemExit("transfer ledger hash does not match the freeze candidate")
    require_clean(SOURCE, "source")
    if args.apply:
        require_clean(DESTINATION, "destination")

    paths = transfer_paths(prefix)
    total_bytes = 0
    collisions: list[str] = []
    identical: list[str] = []
    missing: list[str] = []

    for relative in paths:
        source = safe_path(SOURCE, relative)
        destination = safe_path(DESTINATION, relative)
        if not source.is_file():
            missing.append(relative)
            continue
        total_bytes += source.stat().st_size
        if destination.exists():
            if not destination.is_file():
                collisions.append(f"{relative} (destination is not a file)")
            elif relative in allowed_existing:
                identical.append(relative)
            elif source.read_bytes() == destination.read_bytes() and args.allow_existing_identical:
                identical.append(relative)
            else:
                collisions.append(relative)

    print(f"source: {SOURCE}@{EXPECTED_SOURCE_COMMIT}")
    print(f"destination: {DESTINATION}")
    print(f"ledger: {LEDGER} sha256={EXPECTED_LEDGER_SHA256}")
    print(f"phase: {args.phase or 'full-ledger audit only'}")
    print(f"prefix: {prefix or '(all transfer rows; apply forbidden)'}")
    print(f"transfer files: {len(paths)}")
    print(f"source bytes: {total_bytes}")
    unused_allowances = allowed_existing.difference(paths)
    if unused_allowances:
        raise SystemExit(f"allow-existing paths are not transfer rows: {sorted(unused_allowances)}")
    print(f"existing reviewed/identical skipped: {len(identical)}")
    print(f"collisions: {len(collisions)}")
    print(f"missing source files: {len(missing)}")

    if missing:
        for path in missing[:20]:
            print(f"missing: {path}", file=sys.stderr)
        raise SystemExit("refusing copy because source files are missing")
    if collisions:
        for path in collisions[:50]:
            print(f"collision: {path}", file=sys.stderr)
        raise SystemExit("refusing copy because destination paths already exist")

    if not args.apply:
        print("dry-run only; pass --apply after explicit Creator approval")
        return

    for relative in paths:
        if relative in identical:
            continue
        source = safe_path(SOURCE, relative)
        destination = safe_path(DESTINATION, relative)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)

    print(f"copied {len(paths) - len(identical)} files; no rewrite/quarantine/regenerate/exclude rows were read")


if __name__ == "__main__":
    main()
