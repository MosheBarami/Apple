// First-party UI engineering math. Pure Luau, not a claim of Roblox rendering evidence.
const bounded = `local function bounded(n)
    return type(n) == "number" and n == n and n >= 0 and n <= 1000000
end
`;

export const UI_LOGIC_CURRICULUM = [
  {
    id: 'fit-ui-aspect', family: 'ui-aspect-fitting',
    prompt: 'Write a standalone Luau module returning fit(contentWidth, contentHeight, boxWidth, boxHeight). Each input must be a finite number in [1,1000000]. Return width, height for the largest aspect-preserving fit inside the box; upscaling is allowed. Return nil for invalid input. No Roblox services or state.',
    source: bounded + `return function(cw, ch, bw, bh)
    if not bounded(cw) or not bounded(ch) or not bounded(bw) or not bounded(bh) then return nil end
    if cw < 1 or ch < 1 or bw < 1 or bh < 1 then return nil end
    local scale = math.min(bw / cw, bh / ch)
    return cw * scale, ch * scale
end`,
    checks: `local function near(a, b) return math.abs(a-b) < 1e-6 end
local w,h = candidate(100,50,80,80); assert(near(w,80) and near(h,40))
w,h = candidate(50,100,80,80); assert(near(w,40) and near(h,80))
w,h = candidate(4,3,400,300); assert(near(w,400) and near(h,300))
for cw = 1, 12 do for ch = 1, 12 do
    w,h = candidate(cw,ch,17,23)
    assert(w <= 17+1e-6 and h <= 23+1e-6 and near(w/h,cw/ch))
    assert(near(w,17) or near(h,23))
end end
for _,bad in {0,-1,0.5,1e-300,math.huge,0/0,"10",1000001} do
    for index=1,4 do local args={10,10,10,10}; args[index]=bad; assert(candidate(table.unpack(args))==nil) end
end
assert(candidate(nil,10,10,10)==nil)`,
    mutation: ['local scale = math.min(bw / cw, bh / ch)', 'local scale = math.max(bw / cw, bh / ch)'],
  },
  {
    id: 'visible-ui-rows', family: 'ui-viewport-window',
    prompt: 'Write a standalone Luau module returning visible(count, rowHeight, scroll, viewportHeight). count is an integer in [0,1000000], rowHeight is in (0,1000000], scroll and viewportHeight are in [0,1000000], all finite numbers. Rows have no spacing, are indexed from 1, and intersect the half-open viewport [scroll, scroll + viewportHeight). Return the first and last intersecting row indices, or nil if none or input is invalid. Do not clamp scroll back into content.',
    source: bounded + `return function(count, rowHeight, scroll, viewportHeight)
    if not bounded(count) or count % 1 ~= 0 or not bounded(rowHeight) or rowHeight == 0 then return nil end
    if not bounded(scroll) or not bounded(viewportHeight) then return nil end
    if count == 0 or viewportHeight == 0 then return nil end
    local first = math.floor(scroll / rowHeight) + 1
    local last = math.min(count, math.ceil((scroll + viewportHeight) / rowHeight))
    if first > last or first > count then return nil end
    return first, last
end`,
    checks: `local a,b = candidate(10,20,0,40); assert(a==1 and b==2)
a,b = candidate(10,20,20,40); assert(a==2 and b==3)
a,b = candidate(10,20,19,2); assert(a==1 and b==2)
a,b = candidate(10,20,199,100); assert(a==10 and b==10)
assert(candidate(10,20,200,20)==nil)
assert(candidate(10,20,0,0)==nil and candidate(0,20,0,40)==nil)
for scroll=0,31 do for height=0,12 do
    local first,last=nil,nil
    for i=1,8 do if height>0 and (i-1)*4 < scroll+height and i*4 > scroll then
        first=first or i; last=i
    end end
    a,b=candidate(8,4,scroll,height); assert(a==first and b==last)
end end
assert(candidate(1.5,20,0,40)==nil and candidate(10,0,0,40)==nil)
assert(candidate(10,20,-1,40)==nil and candidate(10,20,0,math.huge)==nil)
assert(candidate(10,20,0/0,40)==nil and candidate("10",20,0,40)==nil)`,
    mutation: ['math.ceil((scroll + viewportHeight) / rowHeight)', 'math.floor((scroll + viewportHeight) / rowHeight)'],
  },
  {
    id: 'ui-grid-columns', family: 'ui-grid-capacity',
    prompt: 'Write a standalone Luau module returning columns(width, minimumCellWidth, gap, limit). width and gap are finite numbers in [0,1000000], minimumCellWidth is finite in (0,1000000], and limit is an integer in [1,10000]. Return the largest number of cells that fits the width with gaps only BETWEEN cells, capped by limit; return 0 if even one cell cannot fit, or nil on invalid input. Do not force a cell wider than the available width.',
    source: bounded + `return function(width, cell, gap, limit)
    if not bounded(width) or not bounded(cell) or cell == 0 or not bounded(gap) then return nil end
    if not bounded(limit) or limit < 1 or limit > 10000 or limit % 1 ~= 0 then return nil end
    if width < cell then return 0 end
    return math.min(limit, math.floor((width + gap) / (cell + gap)))
end`,
    checks: `assert(candidate(100,30,5,10)==3)
assert(candidate(100,30,5,2)==2)
assert(candidate(29,30,5,10)==0 and candidate(30,30,100,10)==1)
assert(candidate(95,30,5,10)==2 and candidate(100,30,5,10)==3)
for width=0,100 do for gap=0,5 do
    local n=candidate(width,7,gap,100)
    assert(n>=0 and n%1==0)
    if n>0 then assert(n*7+(n-1)*gap<=width) end
    assert((n+1)*7+n*gap>width)
end end
assert(candidate(100,0,5,10)==nil and candidate(100,30,-1,10)==nil)
assert(candidate(0/0,30,5,10)==nil and candidate(100,30,math.huge,10)==nil)
assert(candidate(100,30,5,1.5)==nil and candidate(100,30,5,10001)==nil)`,
    mutation: ['(width + gap) / (cell + gap)', 'width / (cell + gap)'],
  },
  {
    id: 'escape-ui-richtext', family: 'ui-richtext-escaping',
    prompt: 'Write a standalone Luau module returning escape(text). For a string of at most 4096 bytes, return a new string escaping ampersand, less-than, greater-than, double quote and apostrophe as &amp; &lt; &gt; &quot; &apos; respectively. Preserve all other bytes, including UTF-8 and newlines. Escape original characters exactly once (existing entity syntax is ordinary input and its ampersand must be escaped). Return nil for nonstrings or oversized input.',
    source: String.raw`return function(text)
    if type(text) ~= "string" or #text > 4096 then return nil end
    local entities = { ["&"]="&amp;", ["<"]="&lt;", [">"]="&gt;", ['"']="&quot;", ["'"]="&apos;" }
    local escaped = string.gsub(text, "[&<>\"']", entities)
    return escaped
end`,
    checks: String.raw`assert(candidate("<&>\"'")=="&lt;&amp;&gt;&quot;&apos;")
assert(candidate("&lt;")=="&amp;lt;")
assert(candidate("plain text")=="plain text" and candidate("")=="")
assert(candidate("שלום 🎮\n")=="שלום 🎮\n")
assert(candidate(string.rep("x",4096))==string.rep("x",4096))
assert(candidate(string.rep("x",4097))==nil)
assert(candidate(123)==nil and candidate({})==nil and candidate(nil)==nil)
assert(candidate("<b>hi</b>")=="&lt;b&gt;hi&lt;/b&gt;")
assert(candidate("&&") == "&amp;&amp;")`,
    mutation: ['#text > 4096', '#text >= 4096'],
  },
];
