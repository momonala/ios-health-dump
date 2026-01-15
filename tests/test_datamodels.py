"""Tests for datamodels module."""

from datetime import datetime

import pytest

from src.datamodels import HealthDump


@pytest.fixture
def sample_datetime():
    """Sample datetime for testing."""
    return datetime(2026, 1, 5, 14, 30, 0)


@pytest.fixture
def sample_health_dump(sample_datetime):
    """Sample HealthDump instance with all fields populated."""
    return HealthDump(
        date="2026-01-05",
        steps=10000,
        kcals=500.5,
        km=8.2,
        flights_climbed=50,
        weight=72.5,
        recorded_at=sample_datetime,
    )


@pytest.fixture
def sample_health_dump_with_nones(sample_datetime):
    """Sample HealthDump instance with None values for optional fields."""
    return HealthDump(
        date="2026-01-05",
        steps=None,
        kcals=None,
        km=None,
        flights_climbed=None,
        weight=None,
        recorded_at=sample_datetime,
    )


class TestToDict:
    """Tests for HealthDump.to_dict() method."""

    def test_to_dict_with_all_fields(self, sample_health_dump):
        """to_dict returns all fields correctly."""
        result = sample_health_dump.to_dict()

        assert result["date"] == "2026-01-05"
        assert result["steps"] == 10000
        assert result["kcals"] == 500.5
        assert result["km"] == 8.2
        assert result["flights_climbed"] == 50
        assert result["weight"] == 72.5
        assert result["recorded_at"] == "2026-01-05T14:30:00"

    def test_to_dict_with_none_values(self, sample_health_dump_with_nones):
        """to_dict handles None values for optional fields."""
        result = sample_health_dump_with_nones.to_dict()

        assert result["date"] == "2026-01-05"
        assert result["steps"] is None
        assert result["kcals"] is None
        assert result["km"] is None
        assert result["flights_climbed"] is None
        assert result["weight"] is None
        assert result["recorded_at"] == "2026-01-05T14:30:00"

    def test_to_dict_recorded_at_is_iso_format(self, sample_health_dump):
        """to_dict formats recorded_at as ISO string."""
        result = sample_health_dump.to_dict()

        assert isinstance(result["recorded_at"], str)
        assert result["recorded_at"] == sample_health_dump.recorded_at.isoformat()


class TestFromDict:
    """Tests for HealthDump.from_dict() classmethod."""

    def test_from_dict_with_string_recorded_at(self):
        """from_dict parses ISO string recorded_at."""
        data = {
            "date": "2026-01-05",
            "steps": 10000,
            "kcals": 500.5,
            "km": 8.2,
            "flights_climbed": 50,
            "weight": 72.5,
            "recorded_at": "2026-01-05T14:30:00",
        }

        result = HealthDump.from_dict(data)

        assert result.date == "2026-01-05"
        assert result.steps == 10000
        assert result.kcals == 500.5
        assert result.km == 8.2
        assert result.flights_climbed == 50
        assert result.weight == 72.5
        assert result.recorded_at == datetime(2026, 1, 5, 14, 30, 0)

    def test_from_dict_with_z_suffix_utc(self):
        """from_dict converts Z suffix to +00:00 timezone."""
        from datetime import timezone

        data = {
            "date": "2026-01-05",
            "steps": 10000,
            "kcals": 500.5,
            "km": 8.2,
            "flights_climbed": 50,
            "weight": 72.5,
            "recorded_at": "2026-01-05T14:30:00Z",
        }

        result = HealthDump.from_dict(data)

        expected = datetime(2026, 1, 5, 14, 30, 0, tzinfo=timezone.utc)
        assert result.recorded_at == expected

    def test_from_dict_with_datetime_object(self):
        """from_dict accepts datetime object for recorded_at."""
        recorded_at = datetime(2026, 1, 5, 14, 30, 0)
        data = {
            "date": "2026-01-05",
            "steps": 10000,
            "kcals": 500.5,
            "km": 8.2,
            "flights_climbed": 50,
            "weight": 72.5,
            "recorded_at": recorded_at,
        }

        result = HealthDump.from_dict(data)

        assert result.recorded_at == recorded_at

    def test_from_dict_with_none_recorded_at(self):
        """from_dict defaults to datetime.now() when recorded_at is None."""
        data = {
            "date": "2026-01-05",
            "steps": 10000,
            "kcals": 500.5,
            "km": 8.2,
            "flights_climbed": 50,
            "weight": 72.5,
            "recorded_at": None,
        }

        before = datetime.now()
        result = HealthDump.from_dict(data)
        after = datetime.now()

        assert before <= result.recorded_at <= after

    def test_from_dict_with_missing_recorded_at(self):
        """from_dict defaults to datetime.now() when recorded_at is missing."""
        data = {
            "date": "2026-01-05",
            "steps": 10000,
            "kcals": 500.5,
            "km": 8.2,
            "flights_climbed": 50,
            "weight": 72.5,
        }

        before = datetime.now()
        result = HealthDump.from_dict(data)
        after = datetime.now()

        assert before <= result.recorded_at <= after

    def test_from_dict_with_none_optional_fields(self):
        """from_dict handles None values for optional fields."""
        data = {
            "date": "2026-01-05",
            "steps": None,
            "kcals": None,
            "km": None,
            "flights_climbed": None,
            "weight": None,
            "recorded_at": "2026-01-05T14:30:00",
        }

        result = HealthDump.from_dict(data)

        assert result.date == "2026-01-05"
        assert result.steps is None
        assert result.kcals is None
        assert result.km is None
        assert result.flights_climbed is None
        assert result.weight is None

    def test_from_dict_raises_keyerror_on_missing_date(self):
        """from_dict raises KeyError when required date field is missing."""
        data = {
            "steps": 10000,
            "kcals": 500.5,
            "km": 8.2,
            "flights_climbed": 50,
            "weight": 72.5,
            "recorded_at": "2026-01-05T14:30:00",
        }

        with pytest.raises(KeyError):
            HealthDump.from_dict(data)


class TestRoundTrip:
    """Tests for round-trip serialization."""

    def test_round_trip_preserves_data(self, sample_health_dump):
        """from_dict(to_dict()) preserves all data."""
        serialized = sample_health_dump.to_dict()
        deserialized = HealthDump.from_dict(serialized)

        assert deserialized.date == sample_health_dump.date
        assert deserialized.steps == sample_health_dump.steps
        assert deserialized.kcals == sample_health_dump.kcals
        assert deserialized.km == sample_health_dump.km
        assert deserialized.flights_climbed == sample_health_dump.flights_climbed
        assert deserialized.weight == sample_health_dump.weight
        assert deserialized.recorded_at == sample_health_dump.recorded_at

    def test_round_trip_with_none_values(self, sample_health_dump_with_nones):
        """from_dict(to_dict()) preserves None values."""
        serialized = sample_health_dump_with_nones.to_dict()
        deserialized = HealthDump.from_dict(serialized)

        assert deserialized.date == sample_health_dump_with_nones.date
        assert deserialized.steps is None
        assert deserialized.kcals is None
        assert deserialized.km is None
        assert deserialized.flights_climbed is None
        assert deserialized.weight is None
        assert deserialized.recorded_at == sample_health_dump_with_nones.recorded_at
