---
name: game-art
description: Making the pictures a Roblox game needs with make_image (the Lucid Origin image model) - button and panel skins, title banners, icons, item art, textures (studs, stripes, materials), backgrounds and decals - and putting them to work in build_ui (skin, pattern, image) or on parts. Covers planning the art list for a screen, one shared style per screen, prompt recipes per kind, transparency and 9-slicing, tinting one skin into many colours, quoted text in banners, cost, and checking the result. Load before any UI or asset that should look drawn rather than flat, and whenever someone asks for something cooler, themed, studded, cartoony, premium or "like a real game".
---

# Game art with make_image

Every picture in a screen or a world comes from `make_image`: skins for buttons and panels, title banners, icons,
item pictures, tiled textures, backgrounds. You design the screen and its behaviour; the image model draws. Live
text (names, numbers, prices, button labels) stays live in build_ui, outlined with `textStroke`, so it scales and
changes at runtime. (3D models are not pictures: build them or take them from the Creator Store.)

## 1. Plan the art before drawing

1. Read the request and the game: theme, mood, audience, what is already in the place (colours, fonts, existing UI).
2. Write ONE style string for the whole screen and reuse it in every call, word for word, so the pieces match:
   - simulator or cartoon: "bright cartoon simulator game art, thick black outlines, glossy plastic, saturated colours, soft top highlight"
   - studded classic Roblox: "classic Roblox plastic bricks, round raised LEGO bumps on top, glossy, thick dark outline, bright primary colours"
   - sci-fi: "clean sci-fi HUD art, dark gunmetal panels, glowing cyan edges, thin bevels"
   - fantasy: "hand-painted fantasy RPG UI, carved wood and gold trim, parchment"
   - horror: "grimy horror game UI, rusted metal, scratched dark paint, dim red glow"
3. List the pieces. A typical screen needs 3-6 images, not 20:
   - one panel skin (the window)
   - one button skin, drawn in a neutral light colour so `tint` makes every colour from it
   - one title banner
   - icons only where a picture says more than a word (currency, items, close)
   - a texture only if the look has one (studs, stripes, wood grain)
4. Call `make_image` for all independent pieces in the SAME step (parallel calls), then build.

## 2. Prompt recipes (kind sets framing, cut-out and size; you describe the thing)

| kind | what you get | prompt shape |
|---|---|---|
| `button` | cut-out, cropped, about 512x214 | "a wide rounded game button, light grey glossy plastic with a white top highlight, thick black outline" + style |
| `panel` | cut-out window frame, about 512x512 | "an empty game window panel, dark slate body, thick black outline, rounded corners, a slightly darker inner well" + style |
| `banner` | cut-out title strip | "a wide ribbon banner with the text \"ADMIN PANEL\" in bold white letters with a black outline" + style |
| `icon` | cut-out, 256 | "a gold coin with a star on it" + style |
| `sprite` | cut-out object, 512 | "a pink lollipop item" + style |
| `texture` | seamless square tile, 256 | "classic Roblox brick top, rows of round raised LEGO bumps, light grey plastic, top-down" |
| `background` | full frame, 1024x576 | "a sunny cartoon island with palm trees, soft blurred, for a menu backdrop" + style |

- Text is drawn only when the prompt quotes it ("\"SHOP\""). Keep quoted text short (1-3 words): titles and logos.
- Say colours, materials, outline weight and lighting. Never ask for a background colour on cut-out kinds: the tool
  handles the background and removes it.
- A green or lime subject is fine: the tool picks a different removal colour by itself.
- The image model's safety filter misreads some game words ("skin", "stud") as adult content. In prompts say
  "button graphic" and "round raised bumps"; the words are fine everywhere else (names, build_ui).
- To redo one piece, change the prompt or pass a different `seed`; keep the style string.

## 3. Using the results in build_ui

`make_image` returns `{ image, width, height, slice? }` and a `use` line showing the exact skin to write.

- **Skin** (a button, panel or banner drawn from art): `skin: { image, size: [width, height], slice }` with the
  `slice` the tool returned, unchanged (it is measured from the art's corners). One skin then serves every size.
- **Many colours from one skin**: tint multiplies, so only a LIGHT skin can take a colour (a dark one stays dark).
  Draw the button or panel light grey or white, then set `skin.tint` per element
  ("#ff3b30", "#ffcc00", "#34c759"). One image, many buttons; half the cost and a perfectly matched set.
- **Label on art**: the button's `text` sits on the skin; give it a display font, white or dark ink, and
  `textStroke` (2-3 px black) so it reads on any colour.
- **Texture**: `pattern: { image, tile: 16-32, t: 0.6-0.85 }` over a gradient or a skin-less frame; for studs, a stud
  `texture` from make_image (or Roblox's classic stud map rbxassetid://10509831729).
- **Icons and items**: an `image` or `icon` node with `fit: "fit"`.
- **Banner**: an `image` node across the top of the panel, `aspect` set to width/height so it never distorts.
  A banner whose text is drawn in it IS the title: never put a live title on top of it (that doubles the words).
  For a title that changes at runtime, draw the banner without text and put live outlined text on it.
- **Backgrounds**: an `image` node behind the panel at `z: 0`, `fit: "crop"`, full size.
- On parts: a texture's id goes on a `Texture` (StudsPerTileU/V) or `Decal`; a SurfaceGui can show any picture.

## 4. Use what you draw

Every picture you make must appear in the screen: a skin you drew and then did not use is money spent for nothing.
Before build_ui, map each image to the node that shows it.

## 5. Check and finish

- build_ui measures the layout; fix every defect it reports.
- If an image is wrong (cut badly, off-style, wrong subject), make it again with a sharper prompt. Don't ship it.
- Motion sells it: in a LocalScript, buttons shrink to 0.94 on press and spring back (UIScale + TweenService
  0.08 s), and hover lifts by 2 px.
- **Cost:** about $0.03 per image. Reuse skins with tint, and reuse a texture rather than drawing variants.
- **Where they live:** pictures are uploaded to the person's own Roblox account and appear in their Creator Hub
  inventory. Tell them once, in the reply.
