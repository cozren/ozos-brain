"""`ozos datapoints refresh` is the datapoints-refresh vital: it refreshes every
daily data point into the vault cache (`--all` for every point) and exits 1 when
any fetch failed. Run as a subprocess because the app config binds the vault at
import time."""

import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def _point(pid, path, refresh):
    return {
        "id": pid,
        "name": pid.upper(),
        "source": {"kind": "csv", "path": path, "column": None},
        "display": "number",
        "refresh": refresh,
        "unit": "",
        "created_at": "x",
    }


def _run(vault, *extra):
    return subprocess.run(
        [sys.executable, "ozos", "datapoints", "refresh", *extra],
        cwd=REPO_ROOT,
        env={**os.environ, "OZOS_VAULT": str(vault)},
        capture_output=True,
        text=True,
    )


def test_datapoints_refresh_cmd(tmp_path):
    vault = tmp_path / "vault"
    (vault / ".ozos").mkdir(parents=True)
    (vault / ".ozos" / "datapoints.json").write_text(
        json.dumps({"datapoints": [_point("a", "a.csv", "daily"), _point("b", "b.csv", "manual")]})
    )
    (vault / "a.csv").write_text("n\n5\n")

    out = _run(vault)
    assert out.returncode == 0, out.stderr
    assert "a: 1 rows" in out.stdout and "b:" not in out.stdout
    cached = json.loads((vault / ".ozos" / "datapoint-cache" / "a.json").read_text())
    assert cached["rows"] == [[5]]
    runs = (vault / ".ozos" / "runs" / "datapoints-refresh.jsonl").read_text().splitlines()
    assert json.loads(runs[-1])["count"] == 1

    out = _run(vault, "--all")
    assert out.returncode == 1
    assert "a: 1 rows" in out.stdout and "b: error: b.csv not found" in out.stdout


def test_datapoints_refresh_without_points(tmp_path):
    vault = tmp_path / "vault"
    (vault / ".ozos").mkdir(parents=True)
    out = _run(vault)
    assert out.returncode == 0 and "no data points to refresh" in out.stdout
