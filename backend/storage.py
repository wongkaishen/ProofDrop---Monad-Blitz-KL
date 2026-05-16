"""File-backed JSON store for the ProofDrop MVP.

We keep the data model dead simple: one JSON file holds three lists
(users, tasks, submissions, vouchers). Reads return a deep copy; writes
acquire a process-level lock and rewrite the file atomically.

Good enough for an MVP / hackathon demo. Swap for a real DB later by
replacing this module — the rest of the app only knows about the
helper functions below.
"""

from __future__ import annotations

import copy
import json
import os
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

DATA_FILE = Path(os.environ.get("PROOFDROP_DATA", Path(__file__).parent / "data.json"))

_lock = threading.RLock()

_DEFAULT: dict[str, Any] = {
    "users": {},        # walletAddress(lower) -> user dict
    "tasks": {},        # taskId -> task dict
    "submissions": {},  # submissionId -> submission dict
    "vouchers": {},     # voucherId -> voucher dict
    "_seq": {           # auto-increment counters per collection
        "task": 0,
        "submission": 0,
        "voucher": 0,
    },
}


def _load_raw() -> dict[str, Any]:
    if not DATA_FILE.exists():
        return copy.deepcopy(_DEFAULT)
    try:
        with DATA_FILE.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (json.JSONDecodeError, OSError):
        return copy.deepcopy(_DEFAULT)
    # Backfill missing top-level keys (forward compatibility).
    for key, default_val in _DEFAULT.items():
        if key not in data:
            data[key] = copy.deepcopy(default_val)
    if "_seq" not in data:
        data["_seq"] = copy.deepcopy(_DEFAULT["_seq"])
    for k, v in _DEFAULT["_seq"].items():
        data["_seq"].setdefault(k, v)
    return data


def _save_raw(data: dict[str, Any]) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    # Atomic write: tmp file + rename, prevents corruption on crash.
    tmp = tempfile.NamedTemporaryFile(
        "w",
        delete=False,
        dir=DATA_FILE.parent,
        prefix=".data-",
        suffix=".json.tmp",
        encoding="utf-8",
    )
    try:
        json.dump(data, tmp, indent=2, sort_keys=False)
        tmp.flush()
        os.fsync(tmp.fileno())
    finally:
        tmp.close()
    os.replace(tmp.name, DATA_FILE)


def read() -> dict[str, Any]:
    """Return a deep copy of the whole store (safe to mutate)."""
    with _lock:
        return copy.deepcopy(_load_raw())


def write(mutator):
    """Atomically mutate the store.

    `mutator(data)` receives a mutable dict and may modify it in place;
    its return value is ignored. The dict is then persisted.
    Returns the new (deep-copied) state.
    """
    with _lock:
        data = _load_raw()
        mutator(data)
        _save_raw(data)
        return copy.deepcopy(data)


def next_id(prefix: str, data: dict[str, Any] | None = None) -> str:
    """Allocate a monotonically increasing id like ``task_42``.

    Two call modes:

    * ``next_id("task")`` — standalone: loads, increments, saves the file.
    * ``next_id("task", data)`` — inside a ``write(mutator)`` block:
      mutates the in-memory dict and lets the surrounding write persist.
      Calling the standalone form inside a write would clobber the
      mutator's other changes when the inner save races the outer save.
    """
    if data is not None:
        seq = data.setdefault("_seq", copy.deepcopy(_DEFAULT["_seq"]))
        seq[prefix] = int(seq.get(prefix, 0)) + 1
        return f"{prefix}_{seq[prefix]:06d}"

    with _lock:
        raw = _load_raw()
        seq = raw["_seq"]
        seq[prefix] = int(seq.get(prefix, 0)) + 1
        _save_raw(raw)
        return f"{prefix}_{seq[prefix]:06d}"


def now() -> int:
    """Unix seconds — keep timestamps simple and JSON-friendly."""
    return int(time.time())


def reset() -> None:
    """Wipe the store. Test helper, not exposed via the API."""
    with _lock:
        if DATA_FILE.exists():
            DATA_FILE.unlink()
