import logging
from datetime import datetime
from pathlib import Path

from flask import Flask
from flask import jsonify
from flask import render_template
from flask import request
from flask import send_from_directory

from src.datamodels import HealthDump
from src.ios_health_dump import get_all_health_data
from src.ios_health_dump import upsert_health_dump

PROJECT_ROOT = Path(__file__).parent.parent
app = Flask(
    __name__,
    static_url_path="/static",
    static_folder=str(PROJECT_ROOT / "static"),
    template_folder=str(PROJECT_ROOT / "templates"),
)

logging.basicConfig(level=logging.INFO)
logging.getLogger("werkzeug").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)


@app.route("/favicon.ico")
def favicon():
    """Serve the favicon."""
    return send_from_directory(app.static_folder, "favicon.ico", mimetype="image/vnd.microsoft.icon")


@app.route("/", methods=["GET"])
def index():
    """Serve the dashboard."""
    return render_template("index.html")


@app.route("/status", methods=["GET"])
def status():
    """Health check endpoint."""
    return jsonify({"status": "ok"})


@app.route("/api/health-data", methods=["GET"])
def get_health_data():
    """Get health data for the dashboard with optional date filtering.

    Query params:
        date_start: YYYY-MM-DD format (inclusive)
        date_end: YYYY-MM-DD format (inclusive)
        date: shortcut for date_start=date_end (e.g., 'today', '2026-01-12')
    """
    date_param = request.args.get("date")
    date_start = request.args.get("date_start")
    date_end = request.args.get("date_end")

    # Handle 'date' shortcut parameter
    if date_param:
        if date_param.lower() == "today":
            date_start = date_end = datetime.now().date().isoformat()
        else:
            date_start = date_end = date_param

    data = get_all_health_data(date_start=date_start, date_end=date_end)
    return jsonify({"data": data})


@app.route("/dump", methods=["POST"])
def dump():
    """Save health dump from iOS app to database."""
    data = request.get_json()
    if not data or not all(key in data for key in ["steps", "kcals", "km"]):
        return jsonify({"status": "error", "message": "Missing required fields: steps, kcals, km"}), 400

    now = datetime.now()
    weight = float(data["weight"].replace(",", ".")) if data.get("weight") else None
    health_dump = HealthDump(
        date=now.date().isoformat(),
        steps=int(data["steps"]),
        kcals=float(data["kcals"]),
        km=float(data["km"]),
        flights_climbed=int(data["flights_climbed"]) if data.get("flights_climbed") is not None else None,
        weight=weight,
        recorded_at=now,
    )
    row_count = upsert_health_dump(health_dump)
    logger.info(f"📲 Saved health dump for iOS app: {health_dump} (rows: {row_count:,})")
    data = get_all_health_data()
    return jsonify({"status": "success", "data": health_dump.to_dict(), "row_count": row_count}), 200


def main():
    app.run(debug=True, host="0.0.0.0", port=5009)


if __name__ == "__main__":
    main()
