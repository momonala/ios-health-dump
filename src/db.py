"""Common database utilities."""

import logging
import sqlite3
from contextlib import contextmanager
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


DB_PATH = Path("data/health_dumps.db")
TABLE_NAME = "health_dumps"


def get_db_connection():
    """Get a connection to the SQLite database."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def db_transaction():
    """Context manager for database transactions.

    Automatically commits on successful exit, rolls back on exception,
    and closes the connection.

    Yields:
        tuple: (connection, cursor) for use within the context
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        yield conn, cursor
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_health_dumps_table() -> None:
    with db_transaction() as (conn, cursor):
        cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{TABLE_NAME}'")
        if cursor.fetchone():
            logger.info("✅ Health dumps table already exists")
            # Check if weight column exists, add it if not
            cursor.execute(f"PRAGMA table_info({TABLE_NAME})")
            columns = [row[1] for row in cursor.fetchall()]
            if "weight" not in columns:
                logger.info("➕ Adding weight column to existing table")
                cursor.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN weight REAL")
            return

        cursor.execute(
            f"""
            CREATE TABLE {TABLE_NAME} (
                date TEXT PRIMARY KEY,
                steps INTEGER,
                kcals REAL,
                km REAL,
                flights_climbed INTEGER,
                weight REAL,
                recorded_at TEXT NOT NULL
            )
        """
        )
        logger.info("✅ Health dumps table initialized")


init_health_dumps_table()
