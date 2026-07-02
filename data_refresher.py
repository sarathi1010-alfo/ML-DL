#!/usr/bin/env python3
"""Background loop: refresh embedded data every 5 minutes."""
import subprocess, time, os
while True:
    try:
        subprocess.run(["python3", "/home/z/my-project/refresh_data.py"], timeout=120, capture_output=True)
    except Exception:
        pass
    time.sleep(300)  # 5 minutes
