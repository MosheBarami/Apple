
-- Proof only: samples every AppleCreature joint's Transform during play and prints how much it moved.
local CollectionService = game:GetService("CollectionService")
task.wait(3)
local seen = {}
for i = 1, 60 do
	for _, m in CollectionService:GetTagged("AppleCreature") do
		for _, d in m:GetDescendants() do
			if d:IsA("Motor6D") or d:IsA("Bone") then
				local rx, ry, rz = d.Transform:ToEulerAnglesXYZ()
				local a = math.abs(rx) + math.abs(ry) + math.abs(rz) + d.Transform.Position.Magnitude
				local key = m.Name .. "/" .. d.Name
				local s = seen[key] or { lo = math.huge, hi = -math.huge, model = m.Name }
				s.lo, s.hi = math.min(s.lo, a), math.max(s.hi, a)
				seen[key] = s
			end
		end
	end
	task.wait(0.1)
end
local per = {}
for key, s in seen do
	local p = per[s.model] or { joints = 0, moving = 0, max = 0 }
	p.joints += 1
	if s.hi - s.lo > 0.02 then p.moving += 1 end
	p.max = math.max(p.max, s.hi - s.lo)
	per[s.model] = p
end
for model, p in per do
	print(("STUDPILOTMOTION PROBE %s: %d of %d joints moved, largest swing %.2f"):format(model, p.moving, p.joints, p.max))
end
