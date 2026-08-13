#!/usr/bin/env python3
"""Derive reviewed phase ledgers from the frozen whole-source transfer ledger."""
from __future__ import annotations

import csv
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "transfer.tsv"
PHASES = {
    "coding-agent.tsv": ("packages/coding-agent/", 794),
    "telemetry.tsv": ("packages/telemetry/", 12),
    "ai.tsv": ("packages/ai/", 372),
    "agent.tsv": ("packages/agent/", 107),
    "tui.tsv": ("packages/tui/", 93),
    "orchestrator.tsv": ("packages/orchestrator/", 48),
    "sqlite-node.tsv": ("packages/storage/sqlite-node/", 18),
}


def main() -> None:
    with SOURCE.open(encoding="utf-8", newline="") as stream:
        comments = []
        lines = []
        for line in stream:
            if line.startswith("#"):
                comments.append(line)
            else:
                lines.append(line)
    rows = list(csv.DictReader(lines, delimiter="\t"))
    for filename, (prefix, expected) in PHASES.items():
        selected = [row for row in rows if row["path"].startswith(prefix)]
        if len(selected) != expected or len({row["path"] for row in selected}) != expected:
            raise SystemExit(f"{filename}: expected {expected} unique rows, found {len(selected)}")
        out = HERE / filename
        with out.open("w", encoding="utf-8", newline="\n") as stream:
            stream.writelines(comments)
            stream.write(f"# phase-prefix\t{prefix}\n")
            stream.write("path\tdisposition\treason\n")
            writer = csv.DictWriter(stream, fieldnames=["path", "disposition", "reason"], delimiter="\t", lineterminator="\n")
            writer.writerows(selected)
        counts: dict[str, int] = {}
        for row in selected:
            counts[row["disposition"]] = counts.get(row["disposition"], 0) + 1
        print(f"wrote {len(selected)} rows to {out}: {counts}")


if __name__ == "__main__":
    main()
