"""Integration tests for main application flows."""

from datetime import datetime

import pytest

from src.app import app
from src.datamodels import HealthDump
from src.db import TABLE_NAME
from src.db import db_transaction
from src.db import init_health_dumps_table
from src.ios_health_dump import get_all_health_data
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


def test_complete_dump_flow(client, temp_db_path):
    """Test complete flow: POST dump -> verify in DB -> GET via API."""
    payload = {
        "steps": 12000,
        "kcals": 550.0,
        "km": 9.5,
        "flights_climbed": 45,
    }

    response = client.post("/dump", json=payload)
    assert response.status_code == 200
    assert response.json["status"] == "success"

    with db_transaction() as (conn, cursor):
        cursor.execute(f"SELECT * FROM {TABLE_NAME}")
        result = cursor.fetchone()

    assert result["steps"] == 12000
    assert result["kcals"] == 550.0

    api_response = client.get("/api/health-data")
    assert api_response.status_code == 200
    assert len(api_response.json["data"]) == 1
    assert api_response.json["data"][0]["steps"] == 12000


def test_multiple_dumps_same_day(client, temp_db_path):
    """Test that newer dump for same day replaces older one."""
    payload1 = {"steps": 5000, "kcals": 250.0, "km": 4.0}
    payload2 = {"steps": 10000, "kcals": 500.0, "km": 8.0}

    client.post("/dump", json=payload1)
    client.post("/dump", json=payload2)

    api_response = client.get("/api/health-data")
    data = api_response.json["data"]

    assert len(data) == 1
    assert data[0]["steps"] == 10000
    assert data[0]["kcals"] == 500.0


def test_upsert_logic_with_timestamps(temp_db_path):
    """Test upsert logic respects recorded_at timestamps."""
    older = HealthDump(
        date="2026-01-05",
        steps=5000,
        kcals=250.0,
        km=4.0,
        flights_climbed=25,
        recorded_at=datetime(2026, 1, 5, 10, 0, 0),
    )
    newer = HealthDump(
        date="2026-01-05",
        steps=10000,
        kcals=500.0,
        km=8.0,
        flights_climbed=50,
        recorded_at=datetime(2026, 1, 5, 20, 0, 0),
    )

    upsert_health_dump(older)
    upsert_health_dump(newer)

    data = get_all_health_data()
    assert len(data) == 1
    assert data[0]["steps"] == 10000


def test_api_returns_sorted_data(client, temp_db_path):
    """Test that API returns data sorted by date DESC."""
    dates = ["2026-01-03", "2026-01-05", "2026-01-04"]
    for date_str in dates:
        dump = HealthDump(
            date=date_str,
            steps=10000,
            kcals=500.0,
            km=8.0,
            flights_climbed=50,
            recorded_at=datetime.fromisoformat(f"{date_str}T14:30:00"),
        )
        upsert_health_dump(dump)

    response = client.get("/api/health-data")
    data = response.json["data"]

    assert len(data) == 3
    assert data[0]["date"] == "2026-01-05"
    assert data[1]["date"] == "2026-01-04"
    assert data[2]["date"] == "2026-01-03"


def test_missing_optional_fields(client, temp_db_path):
    """Test that optional flights_climbed can be omitted."""
    payload = {"steps": 10000, "kcals": 500.0, "km": 8.0}

    response = client.post("/dump", json=payload)
    assert response.status_code == 200

    data = response.json["data"]
    assert data["flights_climbed"] is None


def test_health_check_endpoint(client):
    """Test status endpoint is responsive."""
    response = client.get("/status")
    assert response.status_code == 200
    assert response.json == {"status": "ok"}
