-- PROOF ONLY (never shipped): the look is in Lighting.
local L = game:GetService("Lighting")
assert(L:FindFirstChild("CandyColour") and L.CandyColour.Saturation > 0.2, "the colour correction is saturated")
assert(L:FindFirstChildOfClass("Atmosphere"), "there is an atmosphere")
print("STUDPILOT_PROOF_OK candy-day")
