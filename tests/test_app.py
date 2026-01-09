"""Tests for Flask app routes."""

from datetime import datetime

import pytest

from src.app import app
from src.datamodels import HealthDump
from src.db import TABLE_NAME
from src.db import db_transaction
from src.db import init_health_dumps_table
from src.ios_health_dump import upsert_health_dump


@pytest.fixture
def temp_db_path(tmp_path, monkeypatch):
    """Create a temporary database path for testing."""
    db_file = tmp_path / "test_health_dumps.db"
    monkeypatch.setattr("src.db.DB_PATH", db_file)
    init_health_dumps_table()
    return db_file


@pytest.fixture
def client(temp_db_path):
    """Create Flask test client."""
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


class TestStatus:
    """Tests for /status endpoint."""

    def test_status_returns_ok(self, client):
        """Status endpoint returns ok."""
        response = client.get("/status")

        assert response.status_code == 200
        assert response.json == {"status": "ok"}


class TestIndex:
    """Tests for / endpoint."""

    def test_index_returns_html(self, client):
        """Index endpoint returns HTML template."""
        response = client.get("/")

        assert response.status_code == 200
        assert response.content_type == "text/html; charset=utf-8"


class TestFavicon:
    """Tests for /favicon.ico endpoint."""

    def test_favicon_returns_icon(self, client):
        """Favicon endpoint returns icon file."""
        response = client.get("/favicon.ico")

        assert response.status_code == 200
        assert response.content_type == "image/vnd.microsoft.icon"


class TestGetHealthData:
    """Tests for /api/health-data endpoint."""

    def test_get_health_data_returns_empty_list(self, client):
        """Get health data returns empty list when database is empty."""
        response = client.get("/api/health-data")

        assert response.status_code == 200
        assert response.json == {"data": []}

    def test_get_health_data_returns_all_records(self, client, temp_db_path):
        """Get health data returns all records sorted by date DESC."""
        dump1 = HealthDump(
            date="2026-01-05",
            steps=10000,
            kcals=500.5,
            km=8.2,
            flights_climbed=50,
            recorded_at=datetime(2026, 1, 5, 14, 30, 0),
        )
        dump2 = HealthDump(
            date="2026-01-06",
            steps=8000,
            kcals=400.0,
            km=6.5,
            flights_climbed=30,
            recorded_at=datetime(2026, 1, 6, 14, 30, 0),
        )

        upsert_health_dump(dump1)
        upsert_health_dump(dump2)

        response = client.get("/api/health-data")

        assert response.status_code == 200
        data = response.json["data"]
        assert len(data) == 2
        assert data[0]["date"] == "2026-01-06"
        assert data[1]["date"] == "2026-01-05"


class TestDump:
    """Tests for /dump POST endpoint."""

    def test_dump_creates_health_record(self, client, temp_db_path):
        """Dump endpoint creates health record from JSON."""
        payload = {"steps": 10000, "kcals": 500.5, "km": 8.2}

        response = client.post("/dump", json=payload)

        assert response.status_code == 200
        assert response.json["status"] == "success"
        assert "data" in response.json
        assert "row_count" in response.json
        assert response.json["row_count"] == 1

        data = response.json["data"]
        assert data["steps"] == 10000
        assert data["kcals"] == 500.5
        assert data["km"] == 8.2
        assert "date" in data
        assert "recorded_at" in data

    def test_dump_saves_to_database(self, client, temp_db_path):
        """Dump endpoint saves data to database."""
        payload = {"steps": 10000, "kcals": 500.5, "km": 8.2}

        response = client.post("/dump", json=payload)
        assert response.status_code == 200

        with db_transaction() as (conn, cursor):
            cursor.execute(f"SELECT * FROM {TABLE_NAME}")
            result = cursor.fetchone()

        assert result is not None
        assert result["steps"] == 10000
        assert result["kcals"] == 500.5
        assert result["km"] == 8.2

    def test_dump_requires_steps(self, client):
        """Dump endpoint requires steps field."""
        payload = {"kcals": 500.5, "km": 8.2}

        response = client.post("/dump", json=payload)

        assert response.status_code == 400
        assert response.json["status"] == "error"

    def test_dump_requires_kcals(self, client):
        """Dump endpoint requires kcals field."""
        payload = {"steps": 10000, "km": 8.2}

        response = client.post("/dump", json=payload)

        assert response.status_code == 400
        assert response.json["status"] == "error"

    def test_dump_requires_km(self, client):
        """Dump endpoint requires km field."""
        payload = {"steps": 10000, "kcals": 500.5}

        response = client.post("/dump", json=payload)

        assert response.status_code == 400
        assert response.json["status"] == "error"

    def test_dump_handles_invalid_json(self, client):
        """Dump endpoint handles invalid JSON."""
        response = client.post("/dump", data="invalid json", content_type="application/json")

        assert response.status_code == 400
