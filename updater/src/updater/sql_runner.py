from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Any

import duckdb
import sqlglot

from updater.util import run_timed

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class UpdateScript:
    name: str
    script: str
    params: list[list[Any]] | None = None

    def run(self, conn: duckdb.DuckDBPyConnection, rows: dict[str, int]) -> dict[str, int]:
        statements = sqlglot.parse(self.script, dialect="duckdb")

        for idx, statement in enumerate(statements):
            params = []
            if self.params is not None and len(self.params) > idx:
                params = self.params[idx]

            UpdateScript.__parse_and_run_statement(conn, statement, params, f"{self.name} ({idx + 1})", rows)

        return rows

    @staticmethod
    def __parse_and_run_statement(conn: duckdb.DuckDBPyConnection,
                        statement: sqlglot.Expr,
                        params: list[Any],
                        name: str,
                        rows: dict[str, int]):

        assign_name = None
        assign_from = None

        for comment in statement.comments:
            comment = comment.strip()
            if comment.startswith("assign:"):
                assign_name, assign_from = UpdateScript.__parse_assign(comment.removeprefix("assign:"))
            elif comment.startswith("assert:"):
                UpdateScript.__run_assert(comment.removeprefix("assert:"), rows)
            else:
                name += f" {comment}"

        query = statement.sql(dialect="duckdb")
        if statement.is_leaf():
            LOGGER.info("statement %s is leaf; skipping", repr(query))
            return

        result = run_timed(LOGGER, name, lambda: UpdateScript.__run_statement(conn, query, params, assign_name, assign_from, rows))
        LOGGER.info("%s result %d", repr(name), result)

    @staticmethod
    def __run_statement(conn: duckdb.DuckDBPyConnection,
                        query: str,
                        params: list[Any],
                        assign_name: str | None,
                        assign_from: str | None,
                        rows: dict[str, int]) -> int:

        stmt_result = -1
        if assign_from == "result":
            result = conn.query(query, params=params)
            stmt_result = int(result.fetchone()[0])
        else:
            conn.execute(query, params)
            result = conn.fetchone() # https://github.com/duckdb/duckdb/issues/18525
            if result is not None:
                stmt_result = int(result[0])

        if assign_name is not None:
            rows[assign_name] = stmt_result

        return stmt_result

    @staticmethod
    def __run_assert(assert_stmt: str, rows: dict[str, int]):
        if eval(assert_stmt, {}, rows):
            LOGGER.info("check %s OK", repr(assert_stmt))
        else:
            raise RuntimeError(f"check {repr(assert_stmt)} failed")

    @staticmethod
    def __parse_assign(assign_stmt: str) -> tuple[str, str]:
        idx = assign_stmt.rfind("from:")
        if idx == -1:
            raise ValueError

        name = assign_stmt[:idx]
        name = name.strip()

        assign_from = assign_stmt[idx:]
        assign_from = assign_from.removeprefix("from:")
        assign_from = assign_from.strip()

        if assign_from not in ("result", "rows_affected"):
            raise ValueError

        return name, assign_from