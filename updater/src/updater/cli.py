from __future__ import annotations

import argparse
from datetime import datetime, timezone
import logging

from .config import Settings
from .job import run


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = _parse_args()
    settings.validate()
    run(settings)
    return 0


def _parse_time(value: str) -> datetime:
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    parsed = datetime.fromisoformat(raw)
    if parsed.tzinfo is None:
        raise argparse.ArgumentTypeError("--time must include timezone information")
    return parsed.astimezone(timezone.utc)


def _parse_bool(value: str) -> bool:
    return value.lower() == "true"


def _parse_args() -> Settings:
    parser = argparse.ArgumentParser(prog="updater")
    parser.add_argument("--time", default="")
    parser.add_argument("--database-bucket", required=True)
    parser.add_argument("--full-database-key", required=True)
    parser.add_argument("--basedata-database-key", required=True)
    parser.add_argument("--parquet-bucket", required=True)
    parser.add_argument("--parquet-prefix", required=True)
    parser.add_argument("--input-bucket", default="")
    parser.add_argument("--input-key", default="")
    parser.add_argument("--update-summary-bucket", default="")
    parser.add_argument("--update-summary-key", default="")
    parser.add_argument("--skip-update-database", type=_parse_bool, default=False)
    args = parser.parse_args()

    times = args.time.split(",")
    input_keys = args.input_key.split(",")
    inputs: list[tuple[datetime, str]] = []

    if len(times) != len(input_keys):
        raise argparse.ArgumentTypeError("time and input key must have the same number of elements")

    for time, key in zip(times, input_keys):
        inputs.append((_parse_time(time), key))

    return Settings(
        database_bucket=args.database_bucket,
        full_database_key=args.full_database_key,
        basedata_database_key=args.basedata_database_key,
        parquet_bucket=args.parquet_bucket,
        parquet_prefix=args.parquet_prefix,
        input_bucket=args.input_bucket,
        inputs=inputs,
        update_summary_bucket=args.update_summary_bucket,
        update_summary_key=args.update_summary_key,
        skip_update_database=args.skip_update_database,
    )
