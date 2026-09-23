# Append one plan-limit reading (from the app's get_usage) to limits.json. Usage: python3 add-reading.py '<json of plan>'
import json, sys, time, os
p = os.path.join(os.path.dirname(__file__), 'limits.json')
try: hist = json.load(open(p))
except Exception: hist = []
plan = json.loads(sys.argv[1])
hist.append({'at': int(time.time() * 1000), 'plan': plan})
json.dump(hist[-500:], open(p, 'w'))
print(len(hist), 'readings')
