from dataclasses import dataclass
from datetime import datetime


@dataclass
class HealthDump:
    date: str  # ISO format date string
    steps: int | None
    kcals: float | None
    km: float | None
    flights_climbed: int | None
    recorded_at: datetime  # Actual timestamp when this was recorded

    def to_dict(self) -> dict:
        return {
            "date": self.date,
            "steps": self.steps,
            "kcals": self.kcals,
            "km": self.km,
            "flights_climbed": self.flights_climbed,
            "recorded_at": self.recorded_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "HealthDump":
        recorded_at = data.get("recorded_at")
        if isinstance(recorded_at, str):
            recorded_at = datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))
        elif recorded_at is None:
            recorded_at = datetime.now()

        return cls(
            date=data["date"],
            steps=data["steps"],
            kcals=data["kcals"],
            km=data["km"],
            flights_climbed=data.get("flights_climbed"),
            recorded_at=recorded_at,
        )
