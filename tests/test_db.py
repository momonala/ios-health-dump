"""Tests for db module."""

import sqlite3

import pytest

from src.db import TABLE_NAME
from src.db import db_transaction
from src.db import get_db_connection
from src.db import init_health_dumps_table


@pytest.fixture
def temp_db_path(tmp_path):
    """Create a temporary database path for testing."""
    db_file = tmp_path / "test_health_dumps.db"
    return db_file


@pytest.fixture
def mock_db_path(temp_db_path, monkeypatch):
    """Patch DB_PATH to use temporary database."""
    monkeypatch.setattr("src.db.DB_PATH", temp_db_path)
    return temp_db_path


class TestGetDbConnection:
    """Tests for get_db_connection() function."""

    def test_get_db_connection_returns_connection(self, mock_db_path):
        """get_db_connection returns a SQLite connection."""
        conn = get_db_connection()

        assert isinstance(conn, sqlite3.Connection)
        assert conn.row_factory == sqlite3.Row
        conn.close()

    def test_get_db_connection_creates_database_file(self, mock_db_path):
        """get_db_connection creates database file if it doesn't exist."""
        assert not mock_db_path.exists()

        conn = get_db_connection()
        conn.close()

        assert mock_db_path.exists()


class TestDbTransaction:
    """Tests for db_transaction() context manager."""

    def test_db_transaction_commits_on_success(self, mock_db_path):
        """db_transaction commits changes on successful exit."""
        init_health_dumps_table()

        with db_transaction() as (conn, cursor):
            cursor.execute(
                f"INSERT INTO {TABLE_NAME} (date, steps, kcals, km, recorded_at) VALUES (?, ?, ?, ?, ?)",
                ("2026-01-05", 10000, 500.5, 8.2, "2026-01-05T14:30:00"),
            )

        with db_transaction() as (conn, cursor):
            cursor.execute(f"SELECT * FROM {TABLE_NAME} WHERE date = ?", ("2026-01-05",))
            result = cursor.fetchone()

        assert result is not None
        assert result["date"] == "2026-01-05"

    def test_db_transaction_rolls_back_on_exception(self, mock_db_path):
        """db_transaction rolls back changes on exception."""
        init_health_dumps_table()

        with pytest.raises(ValueError):
            with db_transaction() as (conn, cursor):
                cursor.execute(
                    f"INSERT INTO {TABLE_NAME} (date, steps, kcals, km, weight, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
                    ("2026-01-05", 10000, 500.5, 8.2, 72.5, "2026-01-05T14:30:00"),
                )
                raise ValueError("Test exception")

        with db_transaction() as (conn, cursor):
            cursor.execute(f"SELECT * FROM {TABLE_NAME} WHERE date = ?", ("2026-01-05",))
            result = cursor.fetchone()

        assert result is None

    def test_db_transaction_yields_connection_and_cursor(self, mock_db_path):
        """db_transaction yields both connection and cursor."""
        init_health_dumps_table()

        with db_transaction() as (conn, cursor):
            assert isinstance(conn, sqlite3.Connection)
            assert isinstance(cursor, sqlite3.Cursor)


class TestInitHealthDumpsTable:
    """Tests for init_health_dumps_table() function."""

    def test_init_health_dumps_table_creates_table_with_correct_schema(self, mock_db_path):
        """init_health_dumps_table creates table with correct schema."""
        assert not mock_db_path.exists()

        init_health_dumps_table()

        assert mock_db_path.exists()
        with db_transaction() as (conn, cursor):
            cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{TABLE_NAME}'")
            result = cursor.fetchone()
            assert result is not None
            assert result[0] == TABLE_NAME

            cursor.execute(f"PRAGMA table_info({TABLE_NAME})")
            columns = cursor.fetchall()

        column_names = [col[1] for col in columns]
        assert "date" in column_names
        assert "steps" in column_names
        assert "kcals" in column_names
        assert "km" in column_names
        assert "weight" in column_names
        assert "recorded_at" in column_names

        date_col = next(col for col in columns if col[1] == "date")
        assert date_col[5] == 1

    def test_init_health_dumps_table_is_idempotent(self, mock_db_path):
        """init_health_dumps_table is idempotent and preserves existing data."""
        init_health_dumps_table()

        with db_transaction() as (conn, cursor):
            cursor.execute(
                f"INSERT INTO {TABLE_NAME} (date, steps, kcals, km, weight, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
                ("2026-01-05", 10000, 500.5, 8.2, 72.5, "2026-01-05T14:30:00"),
            )

        init_health_dumps_table()

        with db_transaction() as (conn, cursor):
            cursor.execute(f"SELECT * FROM {TABLE_NAME} WHERE date = ?", ("2026-01-05",))
            result = cursor.fetchone()

        assert result is not None
        assert result["date"] == "2026-01-05"
