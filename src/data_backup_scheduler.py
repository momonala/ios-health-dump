import logging
import subprocess
import time
from datetime import datetime

import schedule

from src.db import DB_PATH

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BRANCH = "main"
file_to_commit = DB_PATH


def run_command(cmd, check=True):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if check and result.returncode != 0:
        logger.error("Command %s failed: %s", cmd, result.stderr.strip())
        raise subprocess.CalledProcessError(result.returncode, cmd, result.stdout, result.stderr)
    return result.stdout.strip()


def force_push_to_git(command: list[str], msg: str):
    try:
        run_command(command)
        logger.info(msg)
    except subprocess.CalledProcessError:
        logger.warning(f"❌ Failed to push to git for {command=} with {msg=}")


def commit_if_changed():
    diff = run_command(["git", "diff", file_to_commit], check=False)
    if not diff:
        logger.info(f"⏭️ [{datetime.now()}] No changes. Skipping commit.")
        return

    run_command(["git", "add", file_to_commit])
    today = datetime.now().date()
    msg = f"Updated {file_to_commit}: {today}"
    should_amend = False

    try:
        last_commit_msg = run_command(["git", "log", "-1", "--pretty=%s"], check=False)
        if str(today) in last_commit_msg:
            should_amend = True
    except subprocess.CalledProcessError:
        logger.info("Unable to read last commit; creating a new commit.")

    if should_amend:
        run_command(["git", "commit", "--amend", "-m", msg])
        msg = f"✅ [{datetime.now()}] Changes amended and force pushed to existing commit for {today} with {msg=}."
        force_push_to_git(["git", "push", "--force", "origin", BRANCH], msg)
    else:
        run_command(["git", "commit", "-m", msg])
        msg = f"✅ [{datetime.now()}] Changes committed and pushed for {today} with {msg=}."
        force_push_to_git(["git", "push", "origin", BRANCH], msg)

    run_command(["cp", file_to_commit, f"{file_to_commit}.bk"])


if __name__ == "__main__":
    schedule.every().hour.at(":00").do(commit_if_changed)
    logger.info("⏰ Init scheduler!")
    logger.info(f"⏰ {schedule.get_jobs()}")

    while True:
        schedule.run_pending()
        time.sleep(30)
