-- PROOF ONLY (never shipped): the cluster's props stand in Workspace.
local n = 0
for _, m in workspace:GetChildren() do if m:IsA("Model") and string.match(m.Name, "%d+$") then n += 1 end end
assert(n >= 3, "the cluster placed its props")
print("STUDPILOT_PROOF_OK prop-cluster")
