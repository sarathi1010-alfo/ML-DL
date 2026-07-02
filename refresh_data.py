#!/usr/bin/env python3
"""Refresh the embedded static data in utils.js from the live FastAPI."""
import json, requests, shutil, re

B = "http://localhost:8000/api/v1"
data = {}
data['health'] = requests.get(f"{B}/health", timeout=10).json()
data['metrics'] = requests.get(f"{B}/metrics", timeout=10).json()
data['metrics_models'] = requests.get(f"{B}/metrics/models", timeout=10).json()
data['predictions'] = requests.get(f"{B}/predictions?limit=20", timeout=10).json()
data['agent_logs'] = requests.get(f"{B}/agent/logs", timeout=10).json()
data['rag_documents'] = requests.get(f"{B}/rag/documents", timeout=10).json()
data['slm_status'] = requests.get(f"{B}/slm/status", timeout=10).json()
data['users_stats'] = requests.get(f"{B}/users/stats", timeout=10).json()
data['auth_me'] = {"id":1,"username":"admin","email":"admin@aiplatform.local","role":"admin"}
data['churn_example'] = requests.post(f"{B}/predict/churn", json={"gender":"Male","age":38,"contract":"Month-to-month","tenure":12,"monthly_charges":75.5}, timeout=10).json()
data['premium_example'] = requests.post(f"{B}/predict/premium", json={"age":45,"bmi":28.5,"smoker":True,"region":2}, timeout=10).json()
data['forecast_example'] = requests.post(f"{B}/predict/forecast", json={"horizon":30}, timeout=10).json()
data['bert_example'] = requests.post(f"{B}/predict/bert", json={"text":"My internet is not working"}, timeout=10).json()
try: data['rag_example'] = requests.post(f"{B}/rag/query", json={"query":"What is the termination notice?","top_k":3}, timeout=30).json()
except: pass
try: data['agent_example'] = requests.post(f"{B}/agent/hr", json={"task":"Onboard","employee_name":"John","role":"Eng","department":"Eng"}, timeout=60).json()
except: pass
try: data['slm_example'] = requests.post(f"{B}/slm/infer", json={"prompt":"Summarize: test"}, timeout=30).json()
except: pass

compact = json.dumps(data, separators=(',',':'))

# Read utils.js, replace the embedded data
with open("/home/z/my-project/public/app/js/utils.js") as f:
    utils = f.read()

# Replace the data between "window.__STATIC_DATA__ = " and the next ";"
new_utils = re.sub(
    r'window\.__STATIC_DATA__\s*=\s*\{.*?\};',
    f'window.__STATIC_DATA__ = {compact};',
    utils,
    flags=re.DOTALL
)
if new_utils == utils:
    print("WARNING: could not find embedded data to replace")
else:
    with open("/home/z/my-project/public/app/js/utils.js", "w") as f:
        f.write(new_utils)
    shutil.copy("/home/z/my-project/public/app/js/utils.js", "/tmp/build_fullstack_1783013436/next-service-dist/public/app/js/utils.js")
    print(f"Refreshed embedded data: {len(new_utils)} bytes")
