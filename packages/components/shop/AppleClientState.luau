--!strict
-- Shared client state between StudPilot's client components: the item being placed and short messages to show.
local State = {}
local picked = Instance.new("BindableEvent")
local said = Instance.new("BindableEvent")
State.picked = nil :: string?
State.Picked = picked.Event -- (id | nil)
State.Said = said.Event -- (text, good)
function State.pick(id: string?)
	if State.picked == id then id = nil end
	State.picked = id
	picked:Fire(id)
end
function State.say(text: string, good: boolean?)
	said:Fire(text, good ~= false)
end
return State
