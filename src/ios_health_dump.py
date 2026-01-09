"""Module for handling iOS health dump data."""

import logging
from datetime import datetime


from src.datamodels import HealthDump
from src.db import TABLE_NAME
from src.db import db_transaction

logger = logging.getLogger(__name__)


def upsert_health_dump(health_dump: HealthDump) -> int:
    with db_transaction() as (conn, cursor):
        cursor.execute(f"SELECT recorded_at FROM {TABLE_NAME} WHERE date = ?", (health_dump.date,))
        existing_record = cursor.fetchone()

        if existing_record:
            existing_recorded_at = datetime.fromisoformat(existing_record["recorded_at"])
            if health_dump.recorded_at <= existing_recorded_at:
                logger.info(f"⏭️ Skipping older health dump for {health_dump.date}")
                cursor.execute(f"SELECT COUNT(*) FROM {TABLE_NAME}")
                total_rows = cursor.fetchone()[0]
                return total_rows

        cursor.execute(
            f"""
            INSERT OR REPLACE INTO {TABLE_NAME} (date, steps, kcals, km, flights_climbed, recorded_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """,
            (
                health_dump.date,
                health_dump.steps,
                health_dump.kcals,
                health_dump.km,
                health_dump.flights_climbed,
                health_dump.recorded_at.isoformat(),
            ),
        )
        logger.debug(f"✅ Successfully upserted health dump for {health_dump}")
        cursor.execute(f"SELECT COUNT(*) FROM {TABLE_NAME}")
        total_rows = cursor.fetchone()[0]
        return total_rows


def get_all_health_data(fill_missing_dates: bool = True) -> list[dict[str, any]]:
    """Get all health data from the database, sorted by date (most recent first).

    Args:
        fill_missing_dates: If True, fill missing dates after August 1, 2022 with historical averages

    Returns:
        List of health data dictionaries
    """
    with db_transaction() as (conn, cursor):
        cursor.execute(
            f"""
            SELECT date, steps, kcals, km, flights_climbed, recorded_at 
            FROM {TABLE_NAME} 
            ORDER BY date DESC
        """
        )
        rows = cursor.fetchall()

    data = [
        {
            "date": row["date"],
            "steps": row["steps"],
            "kcals": row["kcals"],
            "km": row["km"],
            "flights_climbed": row["flights_climbed"],
            "recorded_at": row["recorded_at"],
        }
        for row in rows
    ]

    if fill_missing_dates:
        pass

    return data
