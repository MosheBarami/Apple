import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SOURCE = readFileSync(new URL('../src/StudioCapture.luau', import.meta.url), 'utf8');

function run(spec) {
  const dir = mkdtempSync(join(tmpdir(), 'apple-studio-capture-'));
  const file = join(dir, 'capture.gen.luau');
  const prelude = String.raw`--!nocheck
Vector2 = { new = function(x,y) return { X=x, Y=y } end }
Enum = {
  StudioCaptureScreenshotFormat = { PNG = "PNG" },
  UICaptureMode = { None = "None" },
  ResamplerMode = { Default = "Default" },
}
task = { wait = function(_) end }
local function eq(a,b,why) if a ~= b then error((why or "value") .. ": expected " .. tostring(b) .. ", got " .. tostring(a), 2) end end
local function pngBuffer()
  local b = buffer.create(12)
  for i,v in ipairs({0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4}) do buffer.writeu8(b,i-1,v) end
  return b
end
local passed, failed, errors = 0,0,{}
local function spec(name, fn) local ok,err=pcall(fn); if ok then passed+=1 else failed+=1; table.insert(errors,name..": "..tostring(err)) end end
`;
  const trailer = `\nprint(("capture: %d passed%s"):format(passed, failed > 0 and ", " .. failed .. " FAILED" or "")); for _,e in ipairs(errors) do print(e) end; if failed > 0 then error("capture specs failed") end\n`;
  writeFileSync(file, prelude + '\nlocal StudioCapture=(function()\n' + SOURCE + '\nend)()\n' + spec + trailer);
  return execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' });
}

test('StudioCaptureService adapter returns a bounded PNG frame and requests native permission once', () => {
  const output = run(String.raw`
spec("native png", function()
  local captureService = { allowed=false, requests=0, captures=0 }
  function captureService:CanCaptureScreenshot() return self.allowed end
  function captureService:RequestScreenshotPermissionAsync() self.requests += 1; self.allowed=true; return true end
  function captureService:CaptureScreenshot(options)
    self.captures += 1; self.options=options
    local shot = { BufferStatus="Enum.StudioCaptureBufferStatus.Ready", Resolution=options.OutputSize, destroyed=false }
    function shot:GetBuffer() return pngBuffer() end
    function shot:GetErrors() return {} end
    function shot:Destroy() self.destroyed=true end
    captureService.shot=shot
    return shot
  end
  local encoding = {}
  function encoding:Base64Encode(_) return buffer.fromstring("PNGBASE64") end
  local workspaceRef = { CurrentCamera = { ViewportSize = Vector2.new(1280,720) } }
  local gameRef = {}
  function gameRef:GetService(name) if name == "Workspace" then return workspaceRef end return nil end
  local adapter = StudioCapture.new({ game=gameRef, captureService=captureService, encodingService=encoding, enum=Enum })
  local frame, err = adapter:capture(160,100)
  eq(err,nil); eq(frame.source,"studio_viewport"); eq(frame.encoding,"png"); eq(frame.rgbBase64,"PNGBASE64")
  eq(frame.width,160); eq(frame.height,90); eq(captureService.requests,1); eq(captureService.captures,1)
  eq(captureService.options.Format,"PNG"); eq(captureService.options.UICaptureMode,"None")
  eq(captureService.options.Position.X,0); eq(captureService.options.Position.Y,0)
  eq(captureService.options.CaptureSize.X,1280); eq(captureService.options.CaptureSize.Y,720)
  eq(captureService.options.OutputSize.X,160); eq(captureService.options.OutputSize.Y,90)
  eq(captureService.options.ResampleMode,"Default"); eq(captureService.shot.destroyed,true)
end)

spec("denied permission", function()
  local captureService = {}
  function captureService:CanCaptureScreenshot() return false end
  function captureService:RequestScreenshotPermissionAsync() return false end
  function captureService:CaptureScreenshot(_) error("must not capture") end
  local encoding = {}; function encoding:Base64Encode(v) return v end
  local gameRef = {}; function gameRef:GetService(_) return { CurrentCamera = { ViewportSize = Vector2.new(800,600) } } end
  local adapter = StudioCapture.new({ game=gameRef, captureService=captureService, encodingService=encoding, enum=Enum })
  local frame, err = adapter:capture(100,80)
  eq(frame,nil); eq(type(err),"string")
end)

spec("missing viewport size falls back honestly", function()
  local captureService = { allowed=true, captures=0 }
  function captureService:CanCaptureScreenshot() return true end
  function captureService:CaptureScreenshot(_) self.captures += 1; error("must not crop an unknown viewport") end
  local encoding = {}; function encoding:Base64Encode(v) return v end
  local gameRef = {}; function gameRef:GetService(_) return { CurrentCamera = nil } end
  local adapter = StudioCapture.new({ game=gameRef, captureService=captureService, encodingService=encoding, enum=Enum })
  local frame, err = adapter:capture(100,80)
  eq(frame,nil); eq(type(err),"string"); eq(captureService.captures,0)
end)
`);
  assert.match(output, /^capture: 3 passed$/m, output);
});

test('StudioCapture source contains no upload, HTTP, publication or DataModel write path', () => {
  for (const forbidden of ['HttpService', 'InsertService', 'Publish', 'Upload', 'Parent =', 'SetAttribute', 'UpdateSourceAsync']) {
    assert.equal(SOURCE.includes(forbidden), false, `capture adapter contains forbidden surface: ${forbidden}`);
  }
  assert.match(SOURCE, /StudioCaptureScreenshotFormat\.PNG/);
  assert.match(SOURCE, /UICaptureMode\.None/);
  assert.match(SOURCE, /CaptureSize/);
  assert.match(SOURCE, /ResamplerMode\.Default/);
  assert.match(SOURCE, /MAX_PNG_BYTES/);
});
