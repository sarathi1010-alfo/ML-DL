#!/usr/bin/env python3
"""Double-fork daemon launcher for the uvicorn server.

The bash tool's session may kill its child processes on exit. A double-fork
with setsid creates a fully detached daemon that survives the parent shell.
"""
from __future__ import annotations
import os
import sys
import time
import subprocess


def daemonize() -> int:
    pid = os.fork()
    if pid > 0:
        # Parent: wait briefly so we can report the grandchild's PID
        time.sleep(0.5)
        return pid
    # Child: become session leader
    os.setsid()
    pid2 = os.fork()
    if pid2 > 0:
        os._exit(0)
    # Grandchild: write the actual server
    os.chdir("/home/z/my-project/backend")
    # Redirect std streams
    sys.stdout.flush()
    sys.stderr.flush()
    log_fd = os.open("/home/z/my-project/backend/server.log", os.O_RDWR | os.O_CREAT | os.O_TRUNC, 0o644)
    null_fd = os.open("/dev/null", os.O_RDONLY)
    os.dup2(null_fd, 0)
    os.dup2(log_fd, 1)
    os.dup2(log_fd, 2)
    os.close(null_fd)
    os.close(log_fd)
    # Exec uvicorn (replaces the grandchild process)
    os.execvp("python3", ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"])
    os._exit(1)


if __name__ == "__main__":
    daemonize()
