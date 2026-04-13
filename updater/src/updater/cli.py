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
    return parsed


def _parse_bool(value: str) -> bool:
    return value.lower() == "true"


def _parse_args() -> Settings:
    parser = argparse.ArgumentParser(prog="updater")
    parser.add_argument("--time", type=_parse_time, default=datetime.now(timezone.utc))
    parser.add_argument("--database-bucket", required=True)
    parser.add_argument("--full-database-key", required=True)
    parser.add_argument("--basedata-database-key", required=True)
    parser.add_argument("--parquet-bucket", required=True)
    parser.add_argument("--variants-key", required=True)
    parser.add_argument("--report-key", required=True)
    parser.add_argument("--connections-key", required=True)
    parser.add_argument("--history-prefix", required=True)
    parser.add_argument("--latest-prefix", required=True)
    parser.add_argument("--input-bucket", default="")
    parser.add_argument("--input-key", default="")
    parser.add_argument("--update-summary-bucket", default="")
    parser.add_argument("--update-summary-key", default="")
    parser.add_argument("--skip-update-database", type=_parse_bool, default=False)
    args = parser.parse_args()
    return Settings(
        time=args.time,
        database_bucket=args.database_bucket,
        full_database_key=args.full_database_key,
        basedata_database_key=args.basedata_database_key,
        parquet_bucket=args.parquet_bucket,
        variants_key=args.variants_key,
        report_key=args.report_key,
        connections_key=args.connections_key,
        history_prefix=args.history_prefix,
        latest_prefix=args.latest_prefix,
        input_bucket=args.input_bucket,
        input_key=args.input_key,
        update_summary_bucket=args.update_summary_bucket,
        update_summary_key=args.update_summary_key,
        skip_update_database=args.skip_update_database,
    )
