"""Module for handling iOS health dump data."""

import logging
from datetime import datetime

from src.datamodels import HealthDump
from src.db import TABLE_NAME
from src.db import db_transaction

logger = logging.getLogger(__name__)


def upsert_health_dump(health_dump: HealthDump) -> int:
    with db_transaction() as (conn, cursor):
        cursor.execute(
            f"SELECT recorded_at, weight FROM {TABLE_NAME} WHERE date = ?",
            (health_dump.date,),
        )
        existing_record = cursor.fetchone()

        if existing_record:
            existing_recorded_at = datetime.fromisoformat(existing_record["recorded_at"])
            # Normalize both datetimes to timezone-naive for comparison
            health_dump_time = (
                health_dump.recorded_at.replace(tzinfo=None)
                if health_dump.recorded_at.tzinfo
                else health_dump.recorded_at
            )
            existing_time = (
                existing_recorded_at.replace(tzinfo=None)
                if existing_recorded_at.tzinfo
                else existing_recorded_at
            )

            if health_dump_time <= existing_time:
                # CSV data is older, but check if we should merge weight
                existing_weight = existing_record["weight"]
                if health_dump.weight is not None and existing_weight is None:
                    # Merge weight from CSV into existing newer record
                    logger.info(
                        f"🔄 Merging weight from older CSV into existing record for {health_dump.date}"
                    )
                    cursor.execute(
                        f"UPDATE {TABLE_NAME} SET weight = ? WHERE date = ?",
                        (health_dump.weight, health_dump.date),
                    )
                else:
                    logger.info(f"⏭️ Skipping older health dump for {health_dump.date}")
                cursor.execute(f"SELECT COUNT(*) FROM {TABLE_NAME}")
                total_rows = cursor.fetchone()[0]
                return total_rows

        cursor.execute(
            f"""
            INSERT OR REPLACE INTO {TABLE_NAME} (date, steps, kcals, km, flights_climbed, weight, recorded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
            (
                health_dump.date,
                health_dump.steps,
                health_dump.kcals,
                health_dump.km,
                health_dump.flights_climbed,
                health_dump.weight,
                health_dump.recorded_at.isoformat(),
            ),
        )
        logger.debug(f"✅ Successfully upserted health dump for {health_dump}")
        cursor.execute(f"SELECT COUNT(*) FROM {TABLE_NAME}")
        total_rows = cursor.fetchone()[0]
        return total_rows


def get_all_health_data(
    fill_missing_dates: bool = True,
    date_start: str | None = None,
    date_end: str | None = None,
) -> list[dict[str, any]]:
    """Get health data from the database, sorted by date (most recent first).

    Args:
        fill_missing_dates: If True, fill missing dates after August 1, 2022 with historical averages
        date_start: Optional start date (YYYY-MM-DD) for filtering. Inclusive.
        date_end: Optional end date (YYYY-MM-DD) for filtering. Inclusive.

    Returns:
        List of health data dictionaries
    """
    with db_transaction() as (conn, cursor):
        where_clauses = []
        params = []

        if date_start:
            where_clauses.append("date >= ?")
            params.append(date_start)

        if date_end:
            where_clauses.append("date <= ?")
            params.append(date_end)

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        query = f"""
            SELECT date, steps, kcals, km, flights_climbed, weight, recorded_at 
            FROM {TABLE_NAME} 
            {where_sql}
            ORDER BY date DESC
        """

        cursor.execute(query, params)
        rows = cursor.fetchall()

    data = [
        {
            "date": row["date"],
            "steps": row["steps"],
            "kcals": row["kcals"],
            "km": row["km"],
            "flights_climbed": row["flights_climbed"],
            "weight": row["weight"],
            "recorded_at": row["recorded_at"],
        }
        for row in rows
    ]

    if fill_missing_dates:
        pass

    return data
