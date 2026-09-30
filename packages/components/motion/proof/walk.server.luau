
-- Proof only: walks each creature along X for 3 s, idles 2 s, attacks every 4 s.
local CollectionService = game:GetService("CollectionService")
local t0 = os.clock()
local homes = {}
for _, m in CollectionService:GetTagged("AppleCreature") do homes[m] = m:GetPivot() end
local lastAttack = 0
game:GetService("RunService").Heartbeat:Connect(function()
	local t = os.clock() - t0
	local cycle = t % 5
	for m, home in homes do
		if m.Parent then
			local x = if cycle < 3 then math.sin(cycle / 3 * math.pi) * 10 else 0
			local facing = if cycle < 1.5 then 0 else math.pi
			m:PivotTo(home * CFrame.new(x, 0, 0) * CFrame.Angles(0, (if cycle < 3 then facing - math.pi / 2 else 0), 0))
		end
	end
	if t - lastAttack > 4 then
		lastAttack = t
		for m in homes do m:SetAttribute("MotionAttack", t) end
	end
end)
