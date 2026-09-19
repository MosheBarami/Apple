--!strict
-- Software renderer: turns the live DataModel into actual PIXELS the agent can look at.
--
-- Why this exists: Roblox gives Studio plugins no way to read the rendered viewport.
-- ThumbnailGenerator is not a valid service for plugins and CaptureService's callback never fires
-- in edit mode (both verified against real Studio). Without pixels the agent can only ever *infer*
-- that its work looks good, which is exactly the failure this system was built to stop. So we
-- rasterise the scene ourselves: perspective projection, per-pixel depth, lambert shading and a
-- material response curve.
--
-- The image is deliberately small and low-fidelity. It is not a beauty shot — it carries enough
-- signal for a vision model to judge composition, massing, proportion, spacing, silhouette and
-- colour blocking, which is what the critique loop actually needs.
--
-- PORTED, NOT REWRITTEN. The maths below is `apps/plugin/src/Render.luau` — the module whose
-- output the worker's critic, `packages/evals/src/render-scene.mjs` and the background constants in
-- `apps/worker/src/composition.ts` were all calibrated against. A second implementation of a
-- rasteriser would drift from those three at once, silently, and the drift would show up as the
-- critic scoring scenes it cannot actually see. So `bounds`, `viewpoints`, `renderView` and
-- `layoutSummary` keep their exact signatures and behaviour, and the ORIGINAL specs
-- (`apps/plugin/tests/render.spec.luau`, `rasteriser.spec.luau`) are run against this file
-- unmodified by `tests/render-parity.test.mjs`. That is the evidence the port is faithful.
--
-- WHAT CHANGED, AND ONLY THIS: nothing here requires another module, and nothing reaches for a
-- service on its own. `Paths.resolve` is gone — the caller resolves the target through the command
-- engine's own allowlisted resolver and hands over an Instance — and `Lighting`/`Workspace` arrive
-- as arguments. A renderer that could reach the DataModel by itself would be a second, unreviewed
-- path into the place, beside the one the safety contract describes.
--
-- Nothing in this file performs HTTP, loads an asset, evaluates received text, or writes to the
-- place. It reads geometry and returns pixels.

local Render = {}

-- unit-cube corners; faces are quads wound CCW seen from outside, with their outward normal
local C = {
	Vector3.new(-0.5, -0.5, -0.5), Vector3.new(0.5, -0.5, -0.5), Vector3.new(0.5, 0.5, -0.5), Vector3.new(-0.5, 0.5, -0.5),
	Vector3.new(-0.5, -0.5, 0.5), Vector3.new(0.5, -0.5, 0.5), Vector3.new(0.5, 0.5, 0.5), Vector3.new(-0.5, 0.5, 0.5),
}
local FACES: { { any } } = {
	{ 1, 2, 3, 4, Vector3.new(0, 0, -1) }, { 6, 5, 8, 7, Vector3.new(0, 0, 1) },
	{ 5, 1, 4, 8, Vector3.new(-1, 0, 0) }, { 2, 6, 7, 3, Vector3.new(1, 0, 0) },
	{ 4, 3, 7, 8, Vector3.new(0, 1, 0) },  { 5, 6, 2, 1, Vector3.new(0, -1, 0) },
}

-- How each Roblox material reads tonally, so the render carries material information rather than
-- flat albedo. value = brightness multiplier, rough = how much the lambert term flattens out.
local MATERIAL_LOOK: { [string]: { value: number, rough: number, emissive: boolean } } = {
	Neon = { value = 1.25, rough = 1.0, emissive = true },
	Glass = { value = 1.05, rough = 0.8, emissive = false },
	ForceField = { value = 1.1, rough = 0.9, emissive = true },
	Metal = { value = 1.0, rough = 0.15, emissive = false },
	DiamondPlate = { value = 0.95, rough = 0.2, emissive = false },
	Foil = { value = 1.05, rough = 0.15, emissive = false },
	CorrodedMetal = { value = 0.85, rough = 0.6, emissive = false },
	Concrete = { value = 0.86, rough = 0.9, emissive = false },
	Slate = { value = 0.8, rough = 0.85, emissive = false },
	Brick = { value = 0.88, rough = 0.9, emissive = false },
	Cobblestone = { value = 0.84, rough = 0.9, emissive = false },
	Rock = { value = 0.82, rough = 0.9, emissive = false },
	Basalt = { value = 0.72, rough = 0.9, emissive = false },
	Limestone = { value = 0.95, rough = 0.85, emissive = false },
	Marble = { value = 1.0, rough = 0.45, emissive = false },
	Granite = { value = 0.85, rough = 0.7, emissive = false },
	Sand = { value = 1.0, rough = 0.95, emissive = false },
	Grass = { value = 0.9, rough = 0.95, emissive = false },
	LeafyGrass = { value = 0.86, rough = 0.95, emissive = false },
	Ground = { value = 0.82, rough = 0.95, emissive = false },
	Mud = { value = 0.7, rough = 0.95, emissive = false },
	Snow = { value = 1.1, rough = 0.9, emissive = false },
	Ice = { value = 1.05, rough = 0.5, emissive = false },
	Water = { value = 0.95, rough = 0.35, emissive = false },
	Wood = { value = 0.92, rough = 0.8, emissive = false },
	WoodPlanks = { value = 0.92, rough = 0.8, emissive = false },
	Fabric = { value = 0.88, rough = 1.0, emissive = false },
	Plastic = { value = 1.0, rough = 0.5, emissive = false },
	SmoothPlastic = { value = 1.0, rough = 0.4, emissive = false },
	Glacier = { value = 1.05, rough = 0.6, emissive = false },
	Asphalt = { value = 0.7, rough = 0.9, emissive = false },
	Pebble = { value = 0.85, rough = 0.9, emissive = false },
	Salt = { value = 1.05, rough = 0.9, emissive = false },
}

local SUN = Vector3.new(0.35, -0.85, 0.4).Unit
local SKY = 0x9FC7E8
local GROUND = 0x6E7A63
-- Anything this big in plan is a baseplate-style ground plane. It is drawn, but excluded from
-- framing maths so a 2048-stud Baseplate cannot dominate the camera fit.
local GROUND_PLANE_STUDS = 600

type Buf = { colour: { number }, depth: { number }, w: number, h: number }

local function rasterTri(buf: Buf, ax, ay, az, bx, by, bz, cx, cy, cz, packed: number)
	local w = buf.w
	local minx = math.max(0, math.floor(math.min(ax, bx, cx)))
	local maxx = math.min(w - 1, math.ceil(math.max(ax, bx, cx)))
	local miny = math.max(0, math.floor(math.min(ay, by, cy)))
	local maxy = math.min(buf.h - 1, math.ceil(math.max(ay, by, cy)))
	if minx > maxx or miny > maxy then return end
	local area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
	if math.abs(area) < 1e-6 then return end
	local inv = 1 / area
	local ia, ib, ic = 1 / az, 1 / bz, 1 / cz
	for y = miny, maxy do
		local py = y + 0.5
		local row = y * w
		for x = minx, maxx do
			local px = x + 0.5
			-- barycentric coverage; w0/w1/w2 are the weights of c/a/b respectively
			local w0 = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) * inv
			local w1 = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) * inv
			local w2 = 1 - w0 - w1
			if w0 >= -0.002 and w1 >= -0.002 and w2 >= -0.002 then
				-- perspective-correct depth: interpolate 1/z, not z
				local z = 1 / (w2 * ia + w0 * ic + w1 * ib)
				local i = row + x + 1
				if z < buf.depth[i] then
					buf.depth[i] = z
					buf.colour[i] = packed
				end
			end
		end
	end
end

local function renderable(p: Instance): boolean
	return p:IsA("BasePart") and p.Transparency < 0.95
end

--- World-space bounds of a subtree, ignoring ground planes so framing stays useful.
function Render.bounds(root: Instance): (Vector3?, Vector3?)
	local lo: Vector3?, hi: Vector3? = nil, nil
	local function consider(p: BasePart)
		if p.Size.X > GROUND_PLANE_STUDS or p.Size.Z > GROUND_PLANE_STUDS then return end
		for _, c in C do
			local wp = p.CFrame:PointToWorldSpace(Vector3.new(c.X * p.Size.X, c.Y * p.Size.Y, c.Z * p.Size.Z))
			if lo then
				lo = Vector3.new(math.min((lo :: Vector3).X, wp.X), math.min((lo :: Vector3).Y, wp.Y), math.min((lo :: Vector3).Z, wp.Z))
				hi = Vector3.new(math.max((hi :: Vector3).X, wp.X), math.max((hi :: Vector3).Y, wp.Y), math.max((hi :: Vector3).Z, wp.Z))
			else
				lo, hi = wp, wp
			end
		end
	end
	if root:IsA("BasePart") and renderable(root) then consider(root) end
	for _, d in root:GetDescendants() do
		if renderable(d) then consider(d :: BasePart) end
	end
	return lo, hi
end

--- Camera poses for a subject. Multi-view is the point: one angle hides most composition problems.
function Render.viewpoints(lo: Vector3, hi: Vector3, which: string): { { name: string, cf: CFrame } }
	local centre = (lo + hi) * 0.5
	local size = hi - lo
	local radius = math.max(size.Magnitude * 0.5, 4)
	-- Framing distance. Measured: at 2.1x the subject filled only 8-11% of the frame, and the
	-- critic correctly called that out ("a postage stamp in a void") while also hallucinating
	-- detail it could not resolve at that size. 1.35x puts the subject at roughly a third of the
	-- frame with enough margin to read its silhouette against the horizon.
	local d = radius * 1.35
	local function look(offset: Vector3, at: Vector3?): CFrame
		return CFrame.lookAt(centre + offset, at or centre)
	end
	local all = {
		-- three-quarter establishing shot; the single most informative angle for composition
		{ name = "hero", cf = look(Vector3.new(d * 0.72, d * 0.52, d * 0.72)) },
		{ name = "front", cf = look(Vector3.new(0, radius * 0.45, d)) },
		{ name = "side", cf = look(Vector3.new(d, radius * 0.45, 0)) },
		-- plan view reads layout, spacing and negative space, which perspective flattens
		{ name = "top", cf = look(Vector3.new(0.01, d * 1.15, 0.01)) },
		-- roughly player eye height, to judge what someone standing in the scene actually sees
		{
			name = "eye",
			cf = CFrame.lookAt(
				centre + Vector3.new(d * 0.85, -size.Y * 0.5 + 6, d * 0.85),
				centre + Vector3.new(0, -size.Y * 0.25, 0)
			),
		},
	}
	if which == "all" then return all end
	local picked = {}
	for _, v in all do
		if v.name == which then table.insert(picked, v) end
	end
	if #picked == 0 then table.insert(picked, all[1]) end
	return picked
end

local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

local function encodeRGB(colour: { number }, count: number): string
	local out = table.create(count)
	local n = 0
	-- three packed 0xRRGGBB pixels = 9 bytes = exactly 12 base64 chars, so groups never straddle
	local i = 1
	while i <= count do
		local p1 = colour[i]
		local p2 = colour[i + 1]
		local p3 = colour[i + 2]
		local bytes = {
			math.floor(p1 / 65536) % 256, math.floor(p1 / 256) % 256, p1 % 256,
			p2 and math.floor(p2 / 65536) % 256, p2 and math.floor(p2 / 256) % 256, p2 and p2 % 256,
			p3 and math.floor(p3 / 65536) % 256, p3 and math.floor(p3 / 256) % 256, p3 and p3 % 256,
		}
		for k = 1, 9, 3 do
			local b1, b2, b3 = bytes[k], bytes[k + 1], bytes[k + 2]
			if b1 then
				local trip = b1 * 65536 + ((b2 or 0) :: number) * 256 + ((b3 or 0) :: number)
				n += 1
				out[n] = B64:sub(math.floor(trip / 262144) % 64 + 1, math.floor(trip / 262144) % 64 + 1)
					.. B64:sub(math.floor(trip / 4096) % 64 + 1, math.floor(trip / 4096) % 64 + 1)
					.. (if b2 then B64:sub(math.floor(trip / 64) % 64 + 1, math.floor(trip / 64) % 64 + 1) else "=")
					.. (if b3 then B64:sub(trip % 64 + 1, trip % 64 + 1) else "=")
			end
		end
		i += 3
	end
	return table.concat(out)
end

--- Rasterise one view. Returns base64 RGB rows plus what was actually visible in them.
--- The scene a render walks. Passed in by the command engine; the `workspace` global is the
--- fallback ONLY so the original rasteriser specs, which predate the injection, run unchanged.
local function sceneRoot(scene: Instance?): Instance?
	if scene ~= nil then return scene end
	local ok, value = pcall(function() return workspace end)
	if ok then return value end
	return nil
end

function Render.renderView(camCF: CFrame, width: number, height: number, fovDeg: number, scene: Instance?): (string, any)
	local px = width * height
	local buf: Buf = { colour = table.create(px, SKY), depth = table.create(px, math.huge), w = width, h = height }
	local tanHalf = math.tan(math.rad(fovDeg) / 2)
	local aspect = width / height
	local camPos = camCF.Position

	-- horizon fill, so objects read against ground rather than floating in empty sky
	for y = 0, height - 1 do
		if 1 - (y + 0.5) / height * 2 < -0.02 then
			local row = y * width
			for x = 1, width do
				buf.colour[row + x] = GROUND
			end
		end
	end

	local considered, visible, clipped = 0, 0, 0
	local palette: { [number]: boolean } = {}
	local materials: { [string]: number } = {}
	local sp = table.create(8)

	local walked = sceneRoot(scene)
	for _, inst in (if walked then walked:GetDescendants() else {}) do
		if renderable(inst) then
			local part = inst :: BasePart
			considered += 1
			local ok = true
			for i, c in C do
				local wp = part.CFrame:PointToWorldSpace(Vector3.new(c.X * part.Size.X, c.Y * part.Size.Y, c.Z * part.Size.Z))
				local p = camCF:PointToObjectSpace(wp)
				local z = -p.Z
				if z <= 0.05 then
					ok = false -- any corner behind the near plane: skip rather than near-clip
					break
				end
				sp[i] = {
					((p.X / (z * tanHalf * aspect)) * 0.5 + 0.5) * width,
					(1 - ((p.Y / (z * tanHalf)) * 0.5 + 0.5)) * height,
					z,
				}
			end
			if not ok then
				clipped += 1
			else
				visible += 1
				local matName = tostring(part.Material):gsub("Enum%.Material%.", "")
				materials[matName] = (materials[matName] or 0) + 1
				local look = MATERIAL_LOOK[matName] or { value = 1.0, rough = 0.6, emissive = false }
				local base = part.Color
				-- quantise to a 16³ cube: counts *perceptibly* distinct hues, not float noise
				palette[math.floor(base.R * 15) * 256 + math.floor(base.G * 15) * 16 + math.floor(base.B * 15)] = true
				local alpha = 1 - part.Transparency
				for _, f in FACES do
					local i1, i2, i3, i4 = f[1] :: number, f[2] :: number, f[3] :: number, f[4] :: number
					local n = part.CFrame:VectorToWorldSpace(f[5] :: Vector3)
					local fc = part.CFrame:PointToWorldSpace(Vector3.new(
						(C[i1].X + C[i3].X) * 0.5 * part.Size.X,
						(C[i1].Y + C[i3].Y) * 0.5 * part.Size.Y,
						(C[i1].Z + C[i3].Z) * 0.5 * part.Size.Z
					))
					if n:Dot((fc - camPos).Unit) < 0 then -- backface cull
						local lam = if look.emissive
							then 1.2
							else look.value * (0.26 + 0.74 * (math.max(0, -n:Dot(SUN)) * (1 - look.rough * 0.35) + look.rough * 0.25))
						local a, b, c, d = sp[i1], sp[i2], sp[i3], sp[i4]
						-- distance fog keeps depth ordering readable in a flat-shaded image
						local fog = math.clamp((a[3] + b[3] + c[3] + d[3]) * 0.25 / 900, 0, 0.55)
						local r = math.clamp(base.R * lam * alpha, 0, 1) * (1 - fog) + 0.62 * fog
						local g = math.clamp(base.G * lam * alpha, 0, 1) * (1 - fog) + 0.72 * fog
						local bl = math.clamp(base.B * lam * alpha, 0, 1) * (1 - fog) + 0.85 * fog
						local packed = math.floor(r * 255) * 65536 + math.floor(g * 255) * 256 + math.floor(bl * 255)
						rasterTri(buf, a[1], a[2], a[3], b[1], b[2], b[3], c[1], c[2], c[3], packed)
						rasterTri(buf, a[1], a[2], a[3], c[1], c[2], c[3], d[1], d[2], d[3], packed)
					end
				end
			end
		end
	end

	-- how much of the frame the subject actually occupies: a strong signal for bad framing
	local filled = 0
	for i = 1, px do
		if buf.depth[i] < math.huge then filled += 1 end
	end

	local matList = {}
	for k, v in materials do
		table.insert(matList, { material = k, parts = v })
	end
	table.sort(matList, function(a, b) return a.parts > b.parts end)
	local distinct = 0
	for _ in palette do distinct += 1 end

	return encodeRGB(buf.colour, px), {
		width = width,
		height = height,
		partsConsidered = considered,
		partsVisible = visible,
		partsOffCamera = clipped,
		subjectCoverage = math.round(filled / px * 100) / 100,
		distinctColours = distinct,
		materials = matList,
	}
end

--- Render one or more named viewpoints of a subject. `view` is a preset name or "all".
function Render.capture(root: Instance, subject: string, view: string, width: number, height: number, env: any?): any
	local services: any = env or {}
	local scene = services.scene
	local lo, hi = Render.bounds(root)
	if not lo or not hi then
		return { error = "nothing renderable found under " .. subject }
	end
	local w = math.clamp(width, 48, 320)
	local h = math.clamp(height, 32, 240)
	local views = {}
	for _, v in Render.viewpoints(lo :: Vector3, hi :: Vector3, view) do
		local b64, meta = Render.renderView(v.cf, w, h, 55, scene)
		table.insert(views, { name = v.name, rgbBase64 = b64, meta = meta })
	end
	local size = (hi :: Vector3) - (lo :: Vector3)
	return {
		subject = subject,
		boundsSize = {
			math.round(size.X * 10) / 10,
			math.round(size.Y * 10) / 10,
			math.round(size.Z * 10) / 10,
		},
		views = views,
		lighting = Render.lightingState(services.lighting, scene),
		layout = Render.layoutSummary(root),
	}
end

--- Compact geometry summary for layout analysis: position, size and yaw per part.
--- Composition is a question about PLACEMENT, and placement is invisible in a rendered image once
--- objects overlap. The worker computes spacing, lattice and rotation statistics from this — all
--- arithmetic, no model call. Capped so a huge place cannot produce an unbounded payload.
function Render.layoutSummary(root: Instance): any
	local MAX_PARTS = 1500
	local out = {}
	local skipped = 0
	local function consider(p: BasePart)
		if p.Size.X > GROUND_PLANE_STUDS or p.Size.Z > GROUND_PLANE_STUDS then return end
		if #out >= MAX_PARTS then
			skipped += 1
			return
		end
		local _, yaw = p.CFrame:ToEulerAnglesYXZ()
		local function r1(v: number): number
			return math.round(v * 10) / 10
		end
		table.insert(out, {
			r1(p.Position.X), r1(p.Position.Y), r1(p.Position.Z),
			r1(p.Size.X), r1(p.Size.Y), r1(p.Size.Z),
			math.round(math.deg(yaw)),
		})
	end
	if root:IsA("BasePart") and renderable(root) then consider(root) end
	for _, d in root:GetDescendants() do
		if renderable(d) then consider(d :: BasePart) end
	end
	-- flat arrays rather than named fields: 1,500 parts of {x,y,z,sx,sy,sz,yaw} is ~60 KB, and
	-- naming every field would roughly triple that for no gain on the worker side
	return { format = "x,y,z,sx,sy,sz,yawDeg", parts = out, skipped = skipped }
end

--- Reported alongside the render because the rasteriser CANNOT draw lighting: it has one fixed sun
--- and no shadows, PointLights or post-effects. Judging a scene's lighting from these pixels would
--- mark every scene down identically no matter what the builder did, so lighting is judged from
--- this configuration instead. See the note in the critic prompt.
function Render.lightingState(lighting: Instance?, scene: Instance?): any
	local L: any = lighting
	if L == nil then return nil end
	local lights, effects = 0, {}
	local walked = sceneRoot(scene)
	if walked then
		for _, d in walked:GetDescendants() do
			if d:IsA("Light") then lights += 1 end
		end
	end
	for _, c in L:GetChildren() do
		if c:IsA("Atmosphere") or c:IsA("PostEffect") or c:IsA("Sky") then
			table.insert(effects, c.ClassName)
		end
	end
	local function num(v: number): number
		return math.round(v * 100) / 100
	end
	return {
		brightness = num(L.Brightness),
		clockTime = num(L.ClockTime),
		ambient = { math.round(L.Ambient.R * 255), math.round(L.Ambient.G * 255), math.round(L.Ambient.B * 255) },
		outdoorAmbient = { math.round(L.OutdoorAmbient.R * 255), math.round(L.OutdoorAmbient.G * 255), math.round(L.OutdoorAmbient.B * 255) },
		exposureCompensation = num(L.ExposureCompensation),
		geographicLatitude = num(L.GeographicLatitude),
		fogEnd = num(L.FogEnd),
		lightInstances = lights,
		effects = effects,
	}
end

return Render
