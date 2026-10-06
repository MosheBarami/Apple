-- Fills the loading bar over SECONDS, then hides the loading screen. Written by StudPilot's loading-screen block; edit freely.
local TweenService = game:GetService("TweenService")
local ContentProvider = game:GetService("ContentProvider")
local SECONDS = {{seconds}}
local gui = script.Parent
local bar = gui:WaitForChild("Bar")
local fill = bar:WaitForChild("Fill")
local label = bar:WaitForChild("Label")
local started = os.clock()
while os.clock() - started < SECONDS do
	local timeShare = (os.clock() - started) / SECONDS
	local queue = ContentProvider.RequestQueueSize
	local share = math.max(timeShare, queue == 0 and timeShare or 0)
	TweenService:Create(fill, TweenInfo.new(0.2), { Size = UDim2.new(math.clamp(share, 0.05, 1), 0, 1, 0) }):Play()
	label.Text = ("Loading... %d%%"):format(math.floor(share * 100))
	task.wait(0.2)
end
fill.Size = UDim2.new(1, 0, 1, 0)
label.Text = "Ready!"
task.wait(0.6)
gui.Enabled = false
