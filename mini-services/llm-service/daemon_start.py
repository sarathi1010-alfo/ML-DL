#!/usr/bin/env python3
"""Double-fork daemon launcher for the LLM mini-service (bun).

The bash tool's session may kill its child processes on exit. A double-fork
with setsid creates a fully detached daemon that survives the parent shell.
"""
from __future__ import annotations
import os
import sys
import time

PORT = 3003
LOG = "/home/z/my-project/mini-services/llm-service/service.log"
CWD = "/home/z/my-project/mini-services/llm-service"


def daemonize() -> int:
    pid = os.fork()
    if pid > 0:
        time.sleep(0.6)
        return pid
    os.setsid()
    pid2 = os.fork()
    if pid2 > 0:
        os._exit(0)
    os.chdir(CWD)
    sys.stdout.flush()
    sys.stderr.flush()
    log_fd = os.open(LOG, os.O_RDWR | os.O_CREAT | os.O_TRUNC, 0o644)
    null_fd = os.open("/dev/null", os.O_RDONLY)
    os.dup2(null_fd, 0)
    os.dup2(log_fd, 1)
    os.dup2(log_fd, 2)
    os.close(null_fd)
    os.close(log_fd)
    os.execvp("bun", ["bun", "index.ts"])
    os._exit(1)


if __name__ == "__main__":
    daemonize()
