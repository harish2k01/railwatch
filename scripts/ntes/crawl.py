"""crawl.py — polite, resume-safe crawl of the current Indian Railways
timetable through NTES (the National Train Enquiry System).

Two stages:
  1. discovery — NTES has no "list all trains" endpoint, so we find them by
     searching number prefixes. Query "000".."999"; any prefix whose
     answer is nearly full (90+ of 100 possible) is drilled one digit deeper. Union is the roster.
  2. schedules — fetch the full stop list for every discovered number, one JSON
     file per train. Re-runs skip trains already on disk, so the crawl resumes
     safely after any interruption.

Politeness is deliberate: ~1 request every ~1.2s with jitter, exponential
backoff on network trouble, and a hard stop if the endpoint refuses repeatedly.
Please keep it that way — this is a public government service, not a load test.

Output (relative to the repo root):
  scripts/data/raw/schedules/<number>.json   one NTES schedule per train
  data/raw/numbers.json              discovered roster + swept prefixes (resume)
  data/raw/errors.json               numbers that returned nothing (skip on resume)
  data/raw/crawl-status.json         live progress you can cat / watch

Usage:
  python scripts/ntes/crawl.py                 # full crawl (hours; resumable)
  python ntes/crawl.py --pause 1.5     # be even gentler
  python ntes/crawl.py --seed roster.json   # optional: seed extra train numbers
"""
import argparse

import json
import os
import random
import sys
import time
from pathlib import Path

import requests
from ntes import NTESClient
from ntes.client import BASE_URL
from ntes.exceptions import NTESError

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "raw"
SCHED = OUT / "schedules"
STATUS = OUT / "crawl-status.json"
NUMBERS = OUT / "numbers.json"
ERRORS = OUT / "errors.json"

# A 3-digit prefix covers at most 100 numbers and NTES returns more than 60 (e.g. 92 for "126"), so it only
# needs a deeper search when the answer is close to full, in case there is a cap between 92 and 100.
CAP = 90
consecutive_failures = 0
PAUSE = 1.2
FAILED = object()  # a network failure, as opposed to None: NTES answered "nothing here"
RETRY_ROUNDS = 3   # passes over failed prefixes before giving up for this run


class NetworkError(Exception):
    """The request never got a real answer (timeout, connection error, empty or garbled body)."""


class Client(NTESClient):
    """NTESClient that keeps network failures apart from NTES's own "no / invalid" answers.

    The stock client folds both into NTESError, so a crawl from a network NTES ignores looks like a crawl of
    an empty timetable: every prefix "has no trains", nothing stalls, and the run ends DONE with 0 trains."""

    def _request(self, payload):
        try:
            r = self.session.post(BASE_URL, json={"jsonIn": self.crypto.build(payload)}, timeout=self.timeout)
        except requests.RequestException as e:
            raise NetworkError(f"{type(e).__name__}: {e}") from e
        if not r.text.strip():
            raise NetworkError(f"empty response (HTTP {r.status_code})")
        try:
            data = r.json()
        except ValueError as e:
            raise NetworkError(f"invalid json (HTTP {r.status_code})") from e
        decoded = self._decode(data)
        message = self._extract_error(decoded)
        if message:
            raise NTESError(message)
        return decoded


def status(**kw):
    d = json.loads(STATUS.read_text(encoding="utf-8")) if STATUS.exists() else {}
    d.update(kw, updatedAt=time.strftime("%Y-%m-%d %H:%M:%S"))
    STATUS.write_text(json.dumps(d, indent=1), encoding="utf-8")


def nap():
    time.sleep(PAUSE + random.uniform(0, 0.4))


def call(client_fn, *args):
    """Polite call with backoff for NETWORK trouble. An NTESError is a semantic
    'no / invalid' answer (bad query, discontinued number) — fail fast, no retry, returns None.
    A request that never got an answer returns FAILED so the caller can retry it later."""
    global consecutive_failures
    for attempt in range(4):
        try:
            r = client_fn(*args)
            consecutive_failures = 0
            return r
        except NTESError:
            consecutive_failures = 0
            return None
        except Exception as e:  # network / timeout / decode
            wait = [5, 25, 60, 0][attempt]
            if attempt == 3:
                consecutive_failures += 1
                if consecutive_failures >= 12:
                    status(phase="STALLED", error=f"{type(e).__name__}: {e}")
                    print("endpoint refusing repeatedly — stopping politely", flush=True)
                    sys.exit(2)
                return FAILED
            time.sleep(wait)


def discover(client, seed_numbers):
    found = {}
    if NUMBERS.exists():
        found = dict(json.loads(NUMBERS.read_text(encoding="utf-8")))
        print(f"resuming discovery over {len(found)} known numbers", flush=True)
    for no in seed_numbers:
        found.setdefault(str(no), {"src": "seed"})

    meta = found.pop("__prefixes__", {})
    done = set(meta.get("done", []))
    # Prefixes that got no answer last run (including deeper ones a capped prefix added) are searched again.
    stack = [f"{i:03d}" for i in range(1000)] + list(meta.get("failed", []))  # search rejects queries under 3 chars
    swept = 0
    failed = []
    rounds = 0
    while stack or (failed and rounds < RETRY_ROUNDS):
        if not stack:
            rounds += 1
            print(f"discovery: retrying {len(failed)} prefixes that got no answer (round {rounds})", flush=True)
            time.sleep(60)
            stack, failed = failed, []
        p = stack.pop()
        if p in done:
            continue
        r = call(client.search, p)
        nap()
        swept += 1
        if r is FAILED:
            failed.append(p)  # not marked done: retried below, or on the next run
            continue
        trains = (r or {}).get("Trains", []) or []
        for t in trains:
            no = str(t.get("TrainNumber", ""))
            if no.startswith(p) and no not in found:
                found[no] = {"name": t.get("TrainName", ""), "type": t.get("Type", ""), "src": f"search:{p}"}
        if len(trains) >= CAP and len(p) < 5:
            stack.extend(f"{p}{d}" for d in "0123456789")
        done.add(p)
        if swept % 25 == 0:
            _save_numbers(found, done, failed + stack)
            status(phase="discovery", prefixesSwept=swept, queue=len(stack), numbersFound=len(found), prefixesFailed=len(failed))
            print(f"discovery: swept={swept} queue={len(stack)} found={len(found)} failed={len(failed)}", flush=True)

    _save_numbers(found, done, failed)
    status(phase="discovery-done", numbersFound=len(found), prefixesFailed=len(failed))
    print(f"discovery complete: {len(found)} numbers, {len(failed)} prefixes without an answer", flush=True)
    return found, failed


def _save_numbers(found, done, pending=()):
    payload = dict(found)
    # "failed" also holds the unsearched queue, so an interrupted run resumes deeper prefixes it had queued.
    payload["__prefixes__"] = {"done": sorted(done), "failed": sorted(set(pending) - done)}
    NUMBERS.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def fetch_schedules(client, numbers):
    errors = json.loads(ERRORS.read_text(encoding="utf-8")) if ERRORS.exists() else {}
    todo = [n for n in sorted(numbers)
            if not n.startswith("__")
            and not (SCHED / f"{n}.json").exists()
            # "empty" = NTES answered with no schedule: skip. Anything else (network, or the old
            # "empty-or-error" that mixed both) is retried.
            and errors.get(n) != "empty"]
    print(f"schedules: {len(todo)} to fetch ({len(numbers)} known)", flush=True)
    ok = fail = 0
    for i, no in enumerate(todo):
        r = call(client.schedule, no)
        nap()
        if r is not FAILED and r and r.get("stations"):
            (SCHED / f"{no}.json").write_text(json.dumps(r, ensure_ascii=False), encoding="utf-8")
            errors.pop(no, None)
            ok += 1
        else:
            errors[no] = "network" if r is FAILED else "empty"
            fail += 1
        if (i + 1) % 100 == 0:
            ERRORS.write_text(json.dumps(errors, indent=1), encoding="utf-8")
            status(phase="schedules", fetchedThisRun=ok, failedThisRun=fail,
                   remaining=len(todo) - i - 1, schedulesOnDisk=len(list(SCHED.glob("*.json"))))
            print(f"schedules: {i + 1}/{len(todo)} ok={ok} fail={fail}", flush=True)
    ERRORS.write_text(json.dumps(errors, indent=1), encoding="utf-8")
    return sum(1 for v in errors.values() if v != "empty")


def finish(found, failed_prefixes, failed_schedules, min_trains):
    """DONE only for a complete crawl: every prefix answered, every schedule answered, and a believable
    roster size. Otherwise INCOMPLETE (exit 3); the next run resumes and retries what is missing."""
    on_disk = len(list(SCHED.glob("*.json")))
    problems = []
    if failed_prefixes:
        problems.append(f"{failed_prefixes} prefixes got no answer")
    if failed_schedules:
        problems.append(f"{failed_schedules} schedules got no answer")
    if found < min_trains:
        problems.append(f"only {found} trains found (expected at least {min_trains})")
    if problems:
        status(phase="INCOMPLETE", schedulesOnDisk=on_disk, numbersFound=found, problems=problems)
        print("crawl incomplete: " + "; ".join(problems), flush=True)
        sys.exit(3)
    status(phase="DONE", schedulesOnDisk=on_disk, numbersFound=found, problems=[])
    print(f"crawl complete: {found} trains, {on_disk} schedules", flush=True)


def main():
    global PAUSE
    ap = argparse.ArgumentParser(description="Polite, resume-safe NTES timetable crawler")
    ap.add_argument("--pause", type=float, default=PAUSE, help="seconds between requests (default 1.2)")
    ap.add_argument("--min-trains", type=int, default=5000, help="fewer trains than this is treated as a broken crawl (default 5000)")
    ap.add_argument("--seed", type=str, default="", help="optional JSON file of extra train numbers to seed discovery")
    args = ap.parse_args()
    PAUSE = max(1.2, args.pause)  # a floor: do not hammer a public service

    SCHED.mkdir(parents=True, exist_ok=True)
    seed_numbers = []
    if args.seed and Path(args.seed).exists():
        raw = json.loads(Path(args.seed).read_text(encoding="utf-8"))
        seed_numbers = raw if isinstance(raw, list) else list(raw.keys())
        print(f"seeded {len(seed_numbers)} extra numbers", flush=True)

    client = Client()
    # the enquiry server sometimes accepts a connection then goes silent forever;
    # without a read timeout one dead socket hangs the whole crawl
    client.timeout = (10, 30)  # connect, read: passed on every request (a partial on session.request was overridden by the per-call timeout)

    status(phase="starting", pid=os.getpid())
    roster, failed_prefixes = discover(client, seed_numbers)
    failed_schedules = fetch_schedules(client, roster)
    finish(sum(1 for n in roster if not n.startswith("__")), len(failed_prefixes), failed_schedules, args.min_trains)


if __name__ == "__main__":
    main()
