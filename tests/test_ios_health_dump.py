"""Tests for ios_health_dump module."""

from datetime import datetime

import pytest

from datamodels import HealthDump
from db import TABLE_NAME
from db import db_transaction
from db import init_health_dumps_table
from ios_health_dump import get_all_health_data
from ios_health_dump import upsert_health_dump


@pytest.fixture
def temp_db_path(tmp_path, monkeypatch):
    """Create a temporary database path for testing."""
    db_file = tmp_path / "test_health_dumps.db"
    monkeypatch.setattr("db.DB_PATH", db_file)
    init_health_dumps_table()
    return db_file


@pytest.fixture
def sample_health_dump():
    """Sample HealthDump instance."""
    return HealthDump(
        date="2026-01-05",
        steps=10000,
        kcals=500.5,
        km=8.2,
        flights_climbed=50,
        recorded_at=datetime(2026, 1, 5, 14, 30, 0),
    )


@pytest.fixture
def sample_health_dump_with_nones():
    """Sample HealthDump instance with None values."""
    return HealthDump(
        date="2026-01-06",
        steps=None,
        kcals=None,
        km=None,
        flights_climbed=None,
        recorded_at=datetime(2026, 1, 6, 14, 30, 0),
    )


class TestUpsertHealthDump:
    """Tests for upsert_health_dump() function."""

    def test_upsert_inserts_new_record(self, temp_db_path, sample_health_dump):
        """upsert_health_dump inserts new record when date doesn't exist."""
        row_count = upsert_health_dump(sample_health_dump)

        assert row_count == 1

        with db_transaction() as (conn, cursor):
            cursor.execute(f"SELECT * FROM {TABLE_NAME} WHERE date = ?", (sample_health_dump.date,))
            result = cursor.fetchone()

        assert result is not None
        assert result["date"] == "2026-01-05"
        assert result["steps"] == 10000
        assert result["kcals"] == 500.5
        assert result["km"] == 8.2
        assert result["flights_climbed"] == 50

    def test_upsert_updates_existing_record_when_newer(self, temp_db_path, sample_health_dump):
        """upsert_health_dump updates existing record when recorded_at is newer."""
        older_dump = HealthDump(
            date="2026-01-05",
            steps=5000,
            kcals=250.0,
            km=4.0,
            flights_climbed=25,
            recorded_at=datetime(2026, 1, 5, 10, 0, 0),
        )

        upsert_health_dump(older_dump)
        row_count = upsert_health_dump(sample_health_dump)

        assert row_count == 1

        with db_transaction() as (conn, cursor):
            cursor.execute(f"SELECT * FROM {TABLE_NAME} WHERE date = ?", ("2026-01-05",))
            result = cursor.fetchone()

        assert result["steps"] == 10000
        assert result["kcals"] == 500.5
        assert result["km"] == 8.2
        assert result["flights_climbed"] == 50

    def test_upsert_skips_older_or_equal_record(self, temp_db_path, sample_health_dump):
        """upsert_health_dump skips when recorded_at is older or equal."""
        upsert_health_dump(sample_health_dump)

        older_dump = HealthDump(
            date="2026-01-05",
            steps=5000,
            kcals=250.0,
            km=4.0,
            flights_climbed=25,
            recorded_at=datetime(2026, 1, 5, 10, 0, 0),
        )
        equal_dump = HealthDump(
            date="2026-01-05",
            steps=3000,
            kcals=150.0,
            km=2.0,
            flights_climbed=15,
            recorded_at=datetime(2026, 1, 5, 14, 30, 0),
        )

        assert upsert_health_dump(older_dump) == 1
        assert upsert_health_dump(equal_dump) == 1

        with db_transaction() as (conn, cursor):
            cursor.execute(f"SELECT * FROM {TABLE_NAME} WHERE date = ?", ("2026-01-05",))
            result = cursor.fetchone()

        assert result["steps"] == 10000
        assert result["kcals"] == 500.5
        assert result["km"] == 8.2
        assert result["flights_climbed"] == 50

    def test_upsert_handles_none_values(self, temp_db_path, sample_health_dump_with_nones):
        """upsert_health_dump handles None values for optional fields."""
        row_count = upsert_health_dump(sample_health_dump_with_nones)

        assert row_count == 1

        with db_transaction() as (conn, cursor):
            cursor.execute(f"SELECT * FROM {TABLE_NAME} WHERE date = ?", ("2026-01-06",))
            result = cursor.fetchone()

        assert result["steps"] is None
        assert result["kcals"] is None
        assert result["km"] is None
        assert result["flights_climbed"] is None

    def test_upsert_returns_correct_row_count(self, temp_db_path, sample_health_dump):
        """upsert_health_dump returns correct total row count."""
        row_count1 = upsert_health_dump(sample_health_dump)
        assert row_count1 == 1

        dump2 = HealthDump(
            date="2026-01-06",
            steps=8000,
            kcals=400.0,
            km=6.5,
            flights_climbed=30,
            recorded_at=datetime(2026, 1, 6, 14, 30, 0),
        )
        row_count2 = upsert_health_dump(dump2)
        assert row_count2 == 2

        dump3 = HealthDump(
            date="2026-01-07",
            steps=12000,
            kcals=600.0,
            km=10.0,
            flights_climbed=60,
            recorded_at=datetime(2026, 1, 7, 14, 30, 0),
        )
        row_count3 = upsert_health_dump(dump3)
        assert row_count3 == 3


class TestGetAllHealthData:
    """Tests for get_all_health_data() function."""

    def test_get_all_health_data_returns_empty_list_when_empty(self, temp_db_path):
        """get_all_health_data returns empty list when database is empty."""
        result = get_all_health_data()

        assert result == []

    def test_get_all_health_data_returns_sorted_records_with_correct_structure(self, temp_db_path):
        """get_all_health_data returns records sorted by date DESC with correct structure."""
        dump1 = HealthDump(
            date="2026-01-05",
            steps=10000,
            kcals=500.5,
            km=8.2,
            flights_climbed=50,
            recorded_at=datetime(2026, 1, 5, 14, 30, 0),
        )
        dump2 = HealthDump(
            date="2026-01-07",
            steps=12000,
            kcals=600.0,
            km=10.0,
            flights_climbed=60,
            recorded_at=datetime(2026, 1, 7, 14, 30, 0),
        )
        dump3 = HealthDump(
            date="2026-01-06",
            steps=8000,
            kcals=400.0,
            km=6.5,
            flights_climbed=30,
            recorded_at=datetime(2026, 1, 6, 14, 30, 0),
        )

        upsert_health_dump(dump1)
        upsert_health_dump(dump2)
        upsert_health_dump(dump3)

        result = get_all_health_data()

        assert len(result) == 3
        assert result[0]["date"] == "2026-01-07"
        assert result[1]["date"] == "2026-01-06"
        assert result[2]["date"] == "2026-01-05"

        record = result[0]
        assert "date" in record
        assert "steps" in record
        assert "kcals" in record
        assert "km" in record
        assert "flights_climbed" in record
        assert "recorded_at" in record
        assert isinstance(record["recorded_at"], str)
        assert record["steps"] == 12000

    def test_get_all_health_data_handles_none_values(self, temp_db_path, sample_health_dump_with_nones):
        """get_all_health_data handles None values correctly."""
        upsert_health_dump(sample_health_dump_with_nones)

        result = get_all_health_data()

        assert len(result) == 1
        record = result[0]
        assert record["steps"] is None
        assert record["kcals"] is None
        assert record["km"] is None
        assert record["flights_climbed"] is None

    def test_get_all_health_data_fill_missing_dates_parameter(self, temp_db_path, sample_health_dump):
        """get_all_health_data accepts fill_missing_dates parameter (currently no-op)."""
        upsert_health_dump(sample_health_dump)

        result_false = get_all_health_data(fill_missing_dates=False)
        result_true = get_all_health_data(fill_missing_dates=True)

        assert result_false == result_true
