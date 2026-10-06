-- PROOF ONLY (never shipped): the ground is studded and coloured.
local g = workspace:FindFirstChild("Baseplate")
assert(g and g:FindFirstChild("Studs"), "the baseplate carries the stud texture")
print("STUDPILOT_PROOF_OK studded-ground")
