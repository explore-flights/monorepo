from __future__ import annotations

import unittest

import duckdb

from updater.sql_runner import UpdateScript


class UpdateScriptTest(unittest.TestCase):
    def test_assigns_results_and_affected_rows(self) -> None:
        script = UpdateScript(
            name="assignment_test",
            script="""
CREATE TEMP TABLE values_test (value INTEGER);
-- assign: inserted from:rows_affected
INSERT INTO values_test VALUES (?), (?);
-- assign: total from:result
SELECT SUM(value) FROM values_test;
-- assert: inserted == 2 and total == 42
SELECT COUNT(*) FROM values_test;
""",
            params=[[], [17, 25]],
        )

        with duckdb.connect(":memory:") as conn:
            rows = script.run(conn, {})

        self.assertEqual(rows, {"inserted": 2, "total": 42})
