"""Real PostgreSQL access, grouping, recurrence and retention checks in a test DB."""

import os
from concurrent.futures import ThreadPoolExecutor

import psycopg
from psycopg.types.json import Jsonb

url = os.environ["GIS_TEST_DATABASE_URL"]
event = {
    "event": "worker-failed",
    "component": "gis",
    "dependency": "worker",
    "status": 500,
    "revision": "a" * 40,
}


def record(value):
    with psycopg.connect(url, autocommit=True) as connection:
        if (
            connection.execute("select current_database()").fetchone()[0]
            != "turnright_gis_test"
        ):
            raise RuntimeError("Use the disposable turnright_gis_test database")
        return connection.execute(
            "select record_operational_error(%s)", (Jsonb(value),)
        ).fetchone()[0]


with psycopg.connect(url, autocommit=True) as database:
    if (
        database.execute("select current_database()").fetchone()[0]
        != "turnright_gis_test"
    ):
        raise RuntimeError("Use the disposable turnright_gis_test database")
    for role in ("anon", "authenticated"):
        database.execute("set role " + role)
        for query in (
            "select * from operational_errors",
            "select operational_error_summary()",
            "select prune_operational_errors()",
        ):
            try:
                database.execute(query)
            except psycopg.errors.InsufficientPrivilege:
                pass
            else:
                raise AssertionError("Monitoring exposed to " + role)
        database.execute("reset role")
    for invalid in (
        {**event, "payload": "private"},
        {**event, "component": "private"},
        {**event, "status": 400},
        {**event, "reference": "private"},
        {**event, "revision": "private"},
        [],
    ):
        try:
            record(invalid)
        except psycopg.Error:
            pass
        else:
            raise AssertionError("Accepted unsafe monitoring input")
    with ThreadPoolExecutor(max_workers=4) as pool:
        identities = list(pool.map(record, [event] * 12))
    assert len(set(identities)) == 1
    identity = identities[0]
    group = database.execute("select operational_error_summary()").fetchone()[0][
        "groups"
    ][0]
    assert group["occurrences"] == 12 and group["recent_count"] == 12
    seen = group["last_seen"]
    record(event)
    assert not database.execute(
        "select resolve_operational_error(%s,%s)", (identity, seen)
    ).fetchone()[0]
    seen = database.execute(
        "select last_seen from operational_errors where fingerprint=%s", (identity,)
    ).fetchone()[0]
    assert database.execute(
        "select resolve_operational_error(%s,%s)", (identity, seen)
    ).fetchone()[0]
    record(event)
    assert (
        database.execute(
            "select resolved_at from operational_errors where fingerprint=%s",
            (identity,),
        ).fetchone()[0]
        is None
    )
    database.execute(
        "update operational_errors set window_started=now()-interval '6 minutes'"
    )
    record(event)
    assert (
        database.execute(
            "select window_count from operational_errors where fingerprint=%s",
            (identity,),
        ).fetchone()[0]
        == 1
    )
    # The server-side cap remains effective even when many deployments are reported.
    database.execute(
        "insert into operational_errors(fingerprint,event,component,dependency,status,revision) select md5(i::text),'worker-failed','gis','worker',500,lpad(i::text,40,'0') from generate_series(1,999) i on conflict do nothing"
    )
    record({**event, "revision": "b" * 40})
    assert (
        database.execute("select count(*) from operational_errors").fetchone()[0]
        == 1000
    )
    database.execute("update operational_errors set last_seen=now()-interval '31 days'")
    assert database.execute("select prune_operational_errors()").fetchone()[0] >= 1000
    assert (
        database.execute("select operational_error_summary()").fetchone()[0]["groups"]
        == []
    )
print(
    "Operational monitoring: private roles, redaction, concurrent grouping, recurrence, resolution and retention passed"
)
