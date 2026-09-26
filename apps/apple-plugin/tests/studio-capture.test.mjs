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
  UICaptureMode = { All = "All" },
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
  eq(captureService.options.Format,"PNG"); eq(captureService.options.UICaptureMode,"All")
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

spec("permission API errors retain their actual cause", function()
  local captureService = {requests=0}
  function captureService:CanCaptureScreenshot() return false end
  function captureService:RequestScreenshotPermissionAsync() self.requests+=1; error("actual plugin identity refusal") end
  function captureService:CaptureScreenshot() error("must not bypass refusal") end
  local encoding={};function encoding:Base64Encode(v)return v end
  local adapter=StudioCapture.new({captureService=captureService,encodingService=encoding,enum=Enum})
  local frame,err=adapter:capture(100,80)
  eq(frame,nil);eq(string.find(err,"actual plugin identity refusal",1,true)~=nil,true)
  local _,again=adapter:capture(100,80)
  eq(again,err);eq(captureService.requests,1)
end)

spec("an unexpected permission return shape is not accepted as consent", function()
  local captureService = {}
  function captureService:CanCaptureScreenshot() return false end
  function captureService:RequestScreenshotPermissionAsync() return "Granted" end
  function captureService:CaptureScreenshot() error("must not coerce consent") end
  local encoding={};function encoding:Base64Encode(v)return v end
  local adapter=StudioCapture.new({captureService=captureService,encodingService=encoding,enum=Enum})
  local frame,err=adapter:capture(100,80)
  eq(frame,nil);eq(string.find(err,"unexpected string",1,true)~=nil,true)
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
  assert.match(output, /^capture: 5 passed$/m, output);
});

test('StudioCapture source contains no upload, HTTP, publication or DataModel write path', () => {
  for (const forbidden of ['HttpService', 'InsertService', 'Publish', 'Upload', 'Parent =', 'SetAttribute', 'UpdateSourceAsync']) {
    assert.equal(SOURCE.includes(forbidden), false, `capture adapter contains forbidden surface: ${forbidden}`);
  }
  assert.match(SOURCE, /StudioCaptureScreenshotFormat\.PNG/);
  assert.match(SOURCE, /UICaptureMode\.All/);
  assert.match(SOURCE, /CaptureSize/);
  assert.match(SOURCE, /ResamplerMode\.Default/);
  assert.match(SOURCE, /MAX_PNG_BYTES/);
});

test('unsupported permission API uses native callback pixels only with live paired edit consent',()=>{
 const output=run(String.raw`
 spec("legacy native pixels and fences",function()
  local legacyCalls,reads,destroys=0,0,0
  local permission={};function permission:CaptureScreenshot()error("unsupported primary must not run")end;function permission:CanCaptureScreenshot()return false end
  function permission:RequestScreenshotPermissionAsync()error("Feature not supported yet")end
  local legacy={};function legacy:CaptureScreenshot(callback)legacyCalls+=1;callback("rbxtemp://native")end
  local live=true
  local image={Size=Vector2.new(320,209)}
  function image:ReadPixelsBuffer(_,size)reads+=1;local out=buffer.create(size.X*size.Y*4);for i=0,size.X*size.Y-1 do buffer.writeu8(out,i*4,17);buffer.writeu8(out,i*4+1,29);buffer.writeu8(out,i*4+2,43);buffer.writeu8(out,i*4+3,255)end;return out end
  function image:Destroy()destroys+=1 end
  local asset={};function asset:CreateEditableImageAsync(content)eq(content,"rbxtemp://native");return image end
  local enc={};function enc:Base64Encode(value)eq(buffer.len(value),320*209*3);eq(buffer.readu8(value,0),17);eq(buffer.readu8(value,1),29);eq(buffer.readu8(value,2),43);return buffer.fromstring("NATIVE_RGB")end
  local adapter=StudioCapture.new({captureService=permission,legacyCaptureService=legacy,assetService=asset,encodingService=enc,content={fromUri=function(uri)return uri end},isEdit=function()return true end,enum=Enum})
  local frame,err=adapter:capture(320,240,function()return live end)
  eq(err,nil);eq(frame.source,"studio_viewport");eq(frame.encoding,"rgb24");eq(frame.width,320);eq(frame.height,209);eq(frame.captureMethod,"capture_service");eq(frame.rgbBase64,"NATIVE_RGB");eq(reads,1);eq(destroys,1)
  local before=legacyCalls
  image.Size=Vector2.new(1213,793)
  local target={Size=Vector2.new(320,209),Destroy=image.Destroy,ReadPixelsBuffer=image.ReadPixelsBuffer}
  function target:DrawImageTransformed(position,scale,rotation,source,options)
   eq(source,image);eq(position.X,0);eq(rotation,0);eq(scale.X,320/1213);eq(scale.Y,209/793);eq(options.SamplingMode,"Default")
  end
  function asset:CreateEditableImage(options)eq(options.Size.X,320);eq(options.Size.Y,209);return target end
  Enum.ImageCombineType={AlphaBlend="AlphaBlend"}
  local scaled=adapter:capture(320,240,function()return true end)
  eq(scaled.nativeWidth,1213);eq(scaled.nativeHeight,793);eq(scaled.resampled,true);eq(scaled.width,320);eq(scaled.height,209)
  eq(destroys,3);before=legacyCalls
  eq(adapter:capture(320,240),nil);eq(legacyCalls,before)
  eq(adapter:capture(320,240,function()return false end),nil);eq(legacyCalls,before)
  function asset:CreateEditableImageAsync(_)live=false;return image end
  eq(adapter:capture(320,240,function()return live end),nil);eq(destroys,4)
 end)
 spec("real permission false cannot fall through",function()
  local permission={};function permission:CaptureScreenshot()error("unsupported primary must not run")end;function permission:CanCaptureScreenshot()return false end
  function permission:RequestScreenshotPermissionAsync()return false end
  local legacy={};function legacy:CaptureScreenshot(_)error("DENIAL_BYPASS")end
  local enc={};function enc:Base64Encode(value)return value end
  local adapter=StudioCapture.new({captureService=permission,legacyCaptureService=legacy,encodingService=enc,isEdit=function()return true end})
  local frame,err=adapter:capture(320,240,function()return true end)
  eq(frame,nil);eq(string.find(err,"returned false",1,true)~=nil,true)
 end)
 `);assert.match(output,/2 passed/);
});
