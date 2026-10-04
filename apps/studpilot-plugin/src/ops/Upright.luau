--!strict
--[[
	Upright: a model inserted from the library stands up. Seen live 2026-10-01: "make an asmr keyboard" inserted a table
	upside down under the keyboard, and the agent built on it. Some Creator Store models are saved turned over or on
	their side; their pivot carries that turn. After every insert_asset write, each inserted Model whose pivot's up
	axis is more than about 30 degrees off the world's up is turned upright, keeping the way it faces, and set back on
	the ground at the same spot (the bottom of its box where it was). Nothing else is touched.
]]
local Upright = {}

--[[ Pure: the upright pivot for a pivot, keeping where it faces. nil when it already stands (up within ~30 degrees). ]]
function Upright.fix(pivot: CFrame): CFrame?
	if pivot.UpVector.Y >= 0.85 then return nil end
	-- Face along whichever horizontal direction the model's look or up axis gave; never along the vertical.
	local look = Vector3.new(pivot.LookVector.X, 0, pivot.LookVector.Z)
	if look.Magnitude < 0.2 then look = Vector3.new(pivot.UpVector.X, 0, pivot.UpVector.Z) end
	if look.Magnitude < 0.2 then look = Vector3.new(0, 0, -1) end
	return CFrame.lookAt(pivot.Position, pivot.Position + look.Unit)
end

function Upright.build(_api)
	local function watch(_self: any, opName: string): (() -> any)?
		if opName ~= "insert_asset" then return nil end
		local added: { Model } = {}
		local conn = game.DescendantAdded:Connect(function(d)
			if d:IsA("Model") then table.insert(added, d) end
		end)
		return function()
			conn:Disconnect()
			local n = 0
			for _, m in added do
				-- Only the outermost inserted models: a car's wheels are the car's business.
				local outer = true
				for _, other in added do if other ~= m and m:IsDescendantOf(other) then outer = false; break end end
				if not outer or not m.Parent then continue end
				local upright = Upright.fix(m:GetPivot())
				if upright then
					local cf, size = m:GetBoundingBox()
					local bottomBefore = cf.Position - Vector3.new(0, size.Y / 2, 0)
					m:PivotTo(upright)
					local cf2, size2 = m:GetBoundingBox()
					local bottomAfter = cf2.Position - Vector3.new(0, size2.Y / 2, 0)
					m:PivotTo(m:GetPivot() + (bottomBefore - bottomAfter))
					m:SetAttribute("AppleStoodUp", true)
					n += 1
				end
			end
			return n
		end
	end
	return { handlers = {}, watch = watch }
end

return Upright
