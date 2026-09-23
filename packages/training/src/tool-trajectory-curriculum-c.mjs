/**
 * FIRST-PARTY TOOL TRAJECTORIES, BATCH C: GENERAL VISUAL CRAFT. Authored, not harvested.
 *
 * Measured 2026-09-23 against the simulator reference images (docs/gauntlet/visual): the product's
 * UI came out flat — no outlines, no gradients, default fonts, cards collapsed to zero height, icons
 * drawn as missing-glyph boxes — and its maps were a ground plane plus one template, under default
 * lighting. Batches A and B never show a styled GUI or a layered map being built, so the model has
 * never seen one.
 *
 * Every seed here teaches a TECHNIQUE, not a game: the recipes are the general skill cards in
 * packages/corpus/data/skill-cards.json (grounded in the Creator Docs pages they cite), and no
 * seed names, describes or rebuilds any specific experience. The rules are batch A's and B's:
 * a plan names only tools the trajectory calls, the run ends in one of the product's checks, and
 * every seed carries a mutation that must turn the verifier red.
 *
 * Arguments are kept deliberately compact (one screen or one feature per call), because a row is
 * the whole prefix plus its label and the adapter trains at max_seq_length 2048 (lora-apple-v5.yaml).
 */

// Typed property envelopes, exactly as the plugin reads them (apps/apple-plugin/src/Commands.luau).
const C = (r, g, b) => ({ t: 'Color3', v: [r, g, b] });
const U2 = (xs, xo, ys, yo) => ({ t: 'UDim2', v: [xs, xo, ys, yo] });
const U = (s, o) => ({ t: 'UDim', v: [s, o] });
const V2 = (x, y) => ({ t: 'Vector2', v: [x, y] });
const V3 = (x, y, z) => ({ t: 'Vector3', v: [x, y, z] });
const E = (v) => ({ t: 'EnumItem', v });
const N = (v) => ({ t: 'number', v });
const B = (v) => ({ t: 'bool', v });
const S = (v) => ({ t: 'string', v });
const CS = (top, bottom) => ({ t: 'ColorSequence', v: [[0, top], [1, bottom]] });

// The three children every styled surface gets (skill card ui-cartoon-panel-styling).
const corner = (scale) => ({ className: 'UICorner', name: 'Corner', props: { CornerRadius: U(scale, 0) } });
const stroke = (thickness, rgb = [0.05, 0.07, 0.15]) => ({ className: 'UIStroke', name: 'Stroke', props: { Thickness: N(thickness), Color: C(...rgb) } });
const gradient = (top, bottom) => ({ className: 'UIGradient', name: 'Gradient', props: { Rotation: N(90), Color: CS(top, bottom) } });
const square = { className: 'UIAspectRatioConstraint', name: 'Square', props: { AspectRatio: N(1) } };
const label = (name, text, font, size, extra = {}) => ({
  className: 'TextLabel',
  name,
  props: { Text: S(text), Font: E(font), TextScaled: B(true), TextColor3: C(1, 1, 1), BackgroundTransparency: N(1), Size: size, ...extra },
  children: [stroke(2)],
});

const P = (className, name, props, children) => ({ className, name, props: { Anchored: B(true), Material: E('Enum.Material.SmoothPlastic'), ...props }, ...(children ? { children } : {}) });

export const TOOL_TRAJECTORY_CURRICULUM_C = [
  // ------------------------------------------------------------------------------------ UI
  {
    id: 'restyle-flat-menu',
    family: 'ui-restyle-outline-gradient',
    prompt: 'my menu looks super flat and boring, make it look like a proper colorful roblox game ui',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Give the menu depth',
          steps: [
            { title: 'Outline, round and shade the panel', detail: 'UIStroke 4 near-black, UICorner, a light-to-dark UIGradient on Menu.', tool: 'create_instances' },
            { title: 'Cartoon title font', detail: 'FredokaOne on the title, scaled.', tool: 'set_properties' },
            { title: 'Look at it', detail: 'Judge the restyle against the request.', tool: 'inspect_visually' },
          ],
        },
      },
      {
        tool: 'create_instances',
        args: { items: [
          { ...corner(0.08), parent: 'game.StarterGui.MainGui.Menu' },
          { ...stroke(4, [0.04, 0.1, 0.25]), parent: 'game.StarterGui.MainGui.Menu' },
          { ...gradient([0.45, 0.78, 1], [0.12, 0.42, 0.9]), parent: 'game.StarterGui.MainGui.Menu' },
        ] },
      },
      {
        tool: 'set_properties',
        args: { path: 'game.StarterGui.MainGui.Menu.Title', props: { Font: E('Enum.Font.FredokaOne'), TextScaled: B(true), TextColor3: C(1, 1, 1) } },
      },
      { tool: 'inspect_visually', args: { target: 'game.StarterGui.MainGui', intent: 'make the flat menu look like a colorful Roblox game UI' } },
    ],
    reply: 'The menu now has a 4-pixel dark-blue outline, rounded corners and a gradient from light blue at the top to deeper blue at the bottom, and the title uses FredokaOne. The visual check judged the result against what you asked for. Next, give the buttons inside the same treatment (outline, gradient, rounded corners) so the whole menu matches.',
    mutation: { step: 1, path: 'items.2.props.Color.t', value: 'Gradient' },
  },

  {
    id: 'currency-pills-top',
    family: 'ui-currency-pill-hud',
    prompt: 'add a coins and gems counter at the top of the screen, the kind with an icon on the side',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Currency pills',
          steps: [
            { title: 'Two pills in a centred row', detail: 'Pill frames (UICorner 0.5) with an icon disc on the left end and an outlined amount.', tool: 'create_instances' },
            { title: 'Check it on phone and desktop', detail: 'No overlap with the top bar.', tool: 'check_ui_layout' },
            { title: 'Look at it', detail: 'Judge the HUD against the request.', tool: 'inspect_visually' },
          ],
        },
      },
      {
        tool: 'create_instances',
        args: { items: [{
          className: 'ScreenGui', name: 'CurrencyHud', parent: 'game.StarterGui',
          children: [{
            className: 'Frame', name: 'Row',
            props: { AnchorPoint: V2(0.5, 0), Position: U2(0.5, 0, 0.02, 0), Size: U2(0.4, 0, 0.07, 0), BackgroundTransparency: N(1) },
            children: [
              { className: 'UIListLayout', name: 'List', props: { FillDirection: E('Enum.FillDirection.Horizontal'), HorizontalAlignment: E('Enum.HorizontalAlignment.Center'), Padding: U(0.04, 0) } },
              ...[['Coins', [1, 0.8, 0.2]], ['Gems', [0.4, 0.9, 1]]].map(([name, rgb]) => ({
                className: 'Frame', name,
                props: { Size: U2(0.45, 0, 1, 0), BackgroundColor3: C(0.12, 0.14, 0.22) },
                children: [
                  corner(0.5), stroke(3),
                  { className: 'Frame', name: 'Icon', props: { AnchorPoint: V2(0.5, 0.5), Position: U2(0, 0, 0.5, 0), Size: U2(1.2, 0, 1.2, 0), BackgroundColor3: C(...rgb) }, children: [corner(0.5), stroke(3), square] },
                  label('Amount', '0', 'Enum.Font.FredokaOne', U2(0.7, 0, 0.8, 0), { Position: U2(0.2, 0, 0.1, 0) }),
                ],
              })),
            ],
          }],
        }] },
      },
      { tool: 'check_ui_layout', args: { screen: 'game.StarterGui.CurrencyHud', devices: ['phone_portrait', 'desktop'] } },
      { tool: 'inspect_visually', args: { target: 'game.StarterGui.CurrencyHud', intent: 'coins and gems counters at the top with an icon on the side' } },
    ],
    reply: 'CurrencyHud is in: two dark pills centred at the top, each with a round coloured icon disc overlapping its left end (gold for coins, cyan for gems) and an outlined FredokaOne amount. I checked the layout on phone and desktop and then looked at it against your request. The amounts read 0 until a script writes the real values; point me at your leaderstats and I will wire them.',
    mutation: { step: 1, path: 'items.0.children.0.children.1.children.1.props.Thickness', value: 3 },
  },

  {
    id: 'round-side-rail',
    family: 'ui-round-side-buttons',
    prompt: 'put round buttons on the left side for shop, pets and settings like in simulator games',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Side button rail',
          steps: [
            { title: 'A vertical rail of circle buttons', detail: 'ImageButtons with UICorner 0.5, aspect 1 and a thick outline; a stroked label in each.', tool: 'create_instances' },
            { title: 'Look at it', detail: 'The buttons must be circles, not ovals.', tool: 'inspect_visually' },
          ],
        },
      },
      {
        tool: 'create_instances',
        args: { items: [{
          className: 'ScreenGui', name: 'SideRail', parent: 'game.StarterGui',
          children: [{
            className: 'Frame', name: 'Rail',
            props: { AnchorPoint: V2(0, 0.5), Position: U2(0.01, 0, 0.5, 0), Size: U2(0.08, 0, 0.5, 0), BackgroundTransparency: N(1) },
            children: [
              { className: 'UIListLayout', name: 'List', props: { Padding: U(0.03, 0), VerticalAlignment: E('Enum.VerticalAlignment.Center') } },
              ...[['Shop', [0.3, 0.85, 0.35]], ['Pets', [1, 0.6, 0.2]], ['Settings', [0.55, 0.55, 0.65]]].map(([name, rgb]) => ({
                className: 'ImageButton', name,
                props: { Size: U2(1, 0, 1, 0), BackgroundColor3: C(...rgb) },
                children: [corner(0.5), stroke(4), square, gradient([1, 1, 1], [0.75, 0.75, 0.75]), label('Label', name, 'Enum.Font.FredokaOne', U2(0.9, 0, 0.35, 0), { AnchorPoint: V2(0.5, 0.5), Position: U2(0.5, 0, 0.5, 0) })],
              })),
            ],
          }],
        }] },
      },
      { tool: 'inspect_visually', args: { target: 'game.StarterGui.SideRail', intent: 'round shop, pets and settings buttons on the left side' } },
    ],
    reply: 'SideRail is on the left edge, vertically centred: Shop (green), Pets (orange) and Settings (grey) as circles, each an ImageButton with a 4-pixel dark outline, a soft top-light gradient and a stroked FredokaOne label. The aspect-ratio constraint keeps them round on every screen. They do not open anything yet; tell me which frame each should toggle.',
    mutation: { step: 1, path: 'items.0.className', value: ' ' },
  },

  {
    id: 'scrolling-card-grid',
    family: 'ui-scroll-card-grid',
    prompt: 'the item cards in my shop scroll list are squished to nothing, fix the grid so the cards show properly',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Cards that keep their height',
          steps: [
            { title: 'Canvas grows with the content', detail: 'AutomaticCanvasSize Y and a zero CanvasSize on the ScrollingFrame.', tool: 'set_properties' },
            { title: 'Grid with an offset cell height', detail: 'Scale width, offset height, so cells cannot collapse inside the canvas.', tool: 'create_instances' },
            { title: 'Check phone and desktop', detail: 'No zero-height or overlapping cards.', tool: 'check_ui_layout' },
            { title: 'Look at it', detail: 'Judge the list against the request.', tool: 'inspect_visually' },
          ],
        },
      },
      {
        tool: 'set_properties',
        args: { path: 'game.StarterGui.ShopGui.Panel.Items', props: { AutomaticCanvasSize: E('Enum.AutomaticSize.Y'), CanvasSize: U2(0, 0, 0, 0), ScrollBarThickness: N(8) } },
      },
      {
        tool: 'create_instances',
        args: { items: [{ className: 'UIGridLayout', name: 'Grid', parent: 'game.StarterGui.ShopGui.Panel.Items', props: { CellSize: U2(0.3, 0, 0, 170), CellPadding: U2(0.03, 0, 0, 12), SortOrder: E('Enum.SortOrder.LayoutOrder') } }] },
      },
      { tool: 'check_ui_layout', args: { screen: 'game.StarterGui.ShopGui', devices: ['phone_landscape', 'desktop'] } },
      { tool: 'inspect_visually', args: { target: 'game.StarterGui.ShopGui', intent: 'shop item cards show at full size in the scrolling grid' } },
    ],
    reply: 'The cards collapsed because they had scale heights inside a scrolling canvas that sizes itself from its content, so there was nothing for the scale to be a fraction of. Items now grows its canvas on Y from zero, and a UIGridLayout gives every card 30% of the width and a fixed 170-pixel height with 12 pixels between rows. I checked phone and desktop layouts and looked at the result.',
    mutation: { step: 0, path: 'steps.2.tool', value: 'play_check_ui' },
  },

  {
    id: 'no-tofu-icons',
    family: 'ui-safe-icon-glyphs',
    prompt: 'the close button and the coin icon just show empty squares instead of symbols',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Icons that always draw',
          steps: [
            { title: 'Plain X in a bold font', detail: 'Replace the unsupported symbol on Close with ASCII X in GothamBlack.', tool: 'set_properties' },
            { title: 'A real coin image', detail: 'Look up a coin icon in the UI library instead of a glyph.', tool: 'find_ui_asset' },
            { title: 'Look at it', detail: 'No empty boxes anywhere.', tool: 'inspect_visually' },
          ],
        },
      },
      { tool: 'set_properties', args: { path: 'game.StarterGui.ShopGui.Panel.Header.Close', props: { Text: S('X'), Font: E('Enum.Font.GothamBlack'), TextScaled: B(true) } } },
      { tool: 'find_ui_asset', args: { query: 'gold coin', kind: 'icons', limit: 6 } },
      { tool: 'inspect_visually', args: { target: 'game.StarterGui.ShopGui', intent: 'the close button and coin icon draw real symbols, no empty squares' } },
    ],
    reply: 'The squares were symbols the font cannot draw. The close button now says a plain X in GothamBlack, which every font on Roblox renders. For the coin I searched the UI library for a gold coin icon instead of using a text symbol; put the id you like into the coin ImageLabel and it will render the same on every device. The visual check looked for any remaining empty boxes.',
    mutation: { step: 2, path: 'kind', value: 'glyphs' },
  },

  {
    id: 'chunky-play-button',
    family: 'ui-button-depth',
    prompt: 'make a big chunky PLAY button in the middle that looks 3d and pressable',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Pressable play button',
          steps: [
            { title: 'Button with a darker lip underneath', detail: 'Green ImageButton body with outline, gradient and corners over a darker lip frame; stroked label.', tool: 'create_instances' },
            { title: 'Press it in a play session', detail: 'The button must receive the click.', tool: 'play_check_ui' },
            { title: 'Look at it', detail: 'Judge the button against the request.', tool: 'inspect_visually' },
          ],
        },
      },
      {
        tool: 'create_instances',
        args: { items: [{
          className: 'ScreenGui', name: 'PlayGui', parent: 'game.StarterGui',
          children: [
            { className: 'Frame', name: 'Lip', props: { AnchorPoint: V2(0.5, 0.5), Position: U2(0.5, 0, 0.52, 0), Size: U2(0.26, 0, 0.13, 0), BackgroundColor3: C(0.1, 0.45, 0.15), ZIndex: N(1) }, children: [corner(0.3), stroke(4)] },
            {
              className: 'ImageButton', name: 'Play',
              props: { AnchorPoint: V2(0.5, 0.5), Position: U2(0.5, 0, 0.5, 0), Size: U2(0.26, 0, 0.12, 0), BackgroundColor3: C(0.3, 0.85, 0.3), ZIndex: N(2) },
              children: [corner(0.3), stroke(4), gradient([0.6, 1, 0.55], [0.2, 0.7, 0.25]), label('Label', 'PLAY', 'Enum.Font.LuckiestGuy', U2(0.8, 0, 0.7, 0), { AnchorPoint: V2(0.5, 0.5), Position: U2(0.5, 0, 0.5, 0), ZIndex: N(3) })],
            },
          ],
        }] },
      },
      { tool: 'play_check_ui', args: { press: ['game.StarterGui.PlayGui.Play'], seconds: 5 } },
      { tool: 'inspect_visually', args: { target: 'game.StarterGui.PlayGui', intent: 'a big chunky 3d-looking PLAY button in the middle' } },
    ],
    reply: 'PlayGui has a big green PLAY button in the centre: an ImageButton with a 4-pixel dark outline, rounded corners and a light-to-dark green gradient, sitting on a darker green lip that shows below it like a 3D edge, with the label in LuckiestGuy and its own outline. I pressed it in a play session and then looked at it. It does not start anything yet; tell me what PLAY should do.',
    mutation: { step: 2, path: 'press', value: 'game.StarterGui.PlayGui.Play' },
  },

  {
    id: 'reward-popup-panel',
    family: 'ui-reward-popup',
    prompt: 'i need a popup that says you got a reward with a claim button, cartoony style',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Reward popup',
          steps: [
            { title: 'Layered panel', detail: 'Panel with outline, gradient and corners; a saturated header strip with a stroked title; a green claim button.', tool: 'create_instances' },
            { title: 'Check phone and desktop', detail: 'Keeps its shape on every screen.', tool: 'check_ui_layout' },
            { title: 'Look at it', detail: 'Judge the popup against the request.', tool: 'inspect_visually' },
          ],
        },
      },
      {
        tool: 'create_instances',
        args: { items: [{
          className: 'ScreenGui', name: 'RewardGui', parent: 'game.StarterGui',
          children: [{
            className: 'Frame', name: 'Panel',
            props: { AnchorPoint: V2(0.5, 0.5), Position: U2(0.5, 0, 0.5, 0), Size: U2(0.4, 0, 0.45, 0), BackgroundColor3: C(1, 0.95, 0.85) },
            children: [
              corner(0.08), stroke(5, [0.25, 0.12, 0.02]), gradient([1, 0.98, 0.9], [1, 0.85, 0.6]),
              { className: 'UIAspectRatioConstraint', name: 'Shape', props: { AspectRatio: N(1.3) } },
              { className: 'Frame', name: 'Header', props: { Size: U2(1, 0, 0.22, 0), BackgroundColor3: C(1, 0.55, 0.1) }, children: [corner(0.3), stroke(4, [0.25, 0.12, 0.02]), label('Title', 'REWARD!', 'Enum.Font.LuckiestGuy', U2(0.9, 0, 0.8, 0), { Position: U2(0.05, 0, 0.1, 0) })] },
              { className: 'ImageButton', name: 'Claim', props: { AnchorPoint: V2(0.5, 1), Position: U2(0.5, 0, 0.92, 0), Size: U2(0.5, 0, 0.2, 0), BackgroundColor3: C(0.3, 0.85, 0.3) }, children: [corner(0.3), stroke(4), label('Label', 'CLAIM', 'Enum.Font.FredokaOne', U2(0.8, 0, 0.7, 0), { AnchorPoint: V2(0.5, 0.5), Position: U2(0.5, 0, 0.5, 0) })] },
            ],
          }],
        }] },
      },
      { tool: 'check_ui_layout', args: { screen: 'game.StarterGui.RewardGui', devices: ['phone_portrait', 'desktop'] } },
      { tool: 'inspect_visually', args: { target: 'game.StarterGui.RewardGui', intent: 'a cartoony reward popup with a claim button' } },
    ],
    reply: 'RewardGui is a cream panel with a thick brown outline, rounded corners and a warm gradient, an orange header strip with REWARD! in LuckiestGuy, and a green CLAIM button with its own outline. An aspect-ratio constraint keeps it the same shape on phones. I checked the layout on phone and desktop and looked at it. It is always visible for now; say when it should appear and I will script the show and hide.',
    mutation: { step: 0, path: 'steps.0.tool', value: 'build_popup' },
  },

  // ----------------------------------------------------------------------------------- map
  {
    id: 'layered-hub-landform',
    family: 'map-layered-landform',
    prompt: 'the map is just a flat baseplate, turn it into an actual landscape with hills around the edge',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Landform first',
          steps: [
            { title: 'Rolling ground', detail: 'Seeded heightmap of grass over the 200-stud play area.', tool: 'shape_terrain' },
            { title: 'Frame the edges', detail: 'Overlapping rock and ground hills around the perimeter for a skyline.', tool: 'edit_terrain' },
            { title: 'Check the composition', detail: 'Relief and a boundary, not a plane.', tool: 'check_composition' },
          ],
        },
      },
      { tool: 'shape_terrain', args: { action: 'heightmap', min: [-100, -8, -100], max: [100, 16, 100], material: 'Enum.Material.Grass', amplitude: 0.2, scale: 96, octaves: 3, seed: 7 } },
      {
        tool: 'edit_terrain',
        args: { operations: [
          { action: 'fill_ball', center: [-110, 10, -60], radius: 40, material: 'Enum.Material.Rock' },
          { action: 'fill_ball', center: [-100, 18, 30], radius: 32, material: 'Enum.Material.Ground' },
          { action: 'fill_ball', center: [110, 12, 50], radius: 42, material: 'Enum.Material.Rock' },
          { action: 'fill_ball', center: [40, 16, 115], radius: 36, material: 'Enum.Material.Grass' },
          { action: 'fill_ball', center: [-30, 14, -115], radius: 34, material: 'Enum.Material.Ground' },
        ] },
      },
      { tool: 'check_composition', args: { subject: 'scene', intent: 'turn a flat baseplate into a landscape with hills around the edge' } },
    ],
    reply: 'The ground is now terrain: a seeded grass heightmap gently rolling over the 200-stud play area, so the centre is still easy to walk, and five overlapping rock, ground and grass hills around the perimeter give the map a skyline and a boundary. I ran the composition check on the scene. The old Baseplate is still there under the terrain; delete it once you are happy, and next come paths and a central landmark.',
    mutation: { step: 1, path: 'amplitude', value: 'low' },
  },

  {
    id: 'paths-and-plaza',
    family: 'map-paths-plaza',
    prompt: 'players dont know where to go, add some paths that meet in the middle at a little plaza with a fountain',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Paths to a plaza',
          steps: [
            { title: 'Paths in a contrasting material', detail: 'Replace grass with ground in 10-stud strips from the edges to the centre.', tool: 'edit_terrain' },
            { title: 'Plaza and fountain from parts', detail: 'Stone disc, cylinder basin, pillar and neon water.', tool: 'create_instances' },
            { title: 'Look at it', detail: 'Judge the layout against the request.', tool: 'inspect_visually' },
          ],
        },
      },
      {
        tool: 'edit_terrain',
        args: { operations: [
          { action: 'replace_material', min: [-5, -12, -100], max: [5, 20, 100], sourceMaterial: 'Enum.Material.Grass', targetMaterial: 'Enum.Material.Ground' },
          { action: 'replace_material', min: [-100, -12, -5], max: [100, 20, 5], sourceMaterial: 'Enum.Material.Grass', targetMaterial: 'Enum.Material.Ground' },
        ] },
      },
      {
        tool: 'create_instances',
        args: { items: [{
          className: 'Model', name: 'Plaza', parent: 'game.Workspace',
          children: [
            P('Part', 'Floor', { Shape: E('Enum.PartType.Cylinder'), Size: V3(1, 40, 40), Position: V3(0, 4, 0), Orientation: V3(0, 0, 90), Color: C(0.72, 0.7, 0.66), Material: E('Enum.Material.Cobblestone') }),
            P('Part', 'Basin', { Shape: E('Enum.PartType.Cylinder'), Size: V3(3, 16, 16), Position: V3(0, 5.5, 0), Orientation: V3(0, 0, 90), Color: C(0.6, 0.62, 0.66) }),
            P('Part', 'Water', { Shape: E('Enum.PartType.Cylinder'), Size: V3(0.4, 14, 14), Position: V3(0, 7, 0), Orientation: V3(0, 0, 90), Color: C(0.3, 0.7, 1), Transparency: N(0.3) }),
            P('Part', 'Pillar', { Shape: E('Enum.PartType.Cylinder'), Size: V3(8, 2.5, 2.5), Position: V3(0, 10, 0), Orientation: V3(0, 0, 90), Color: C(0.85, 0.83, 0.78) }),
          ],
        }] },
      },
      { tool: 'inspect_visually', args: { target: 'game.Workspace.Plaza', intent: 'paths that meet in the middle at a plaza with a fountain' } },
    ],
    reply: 'Two 10-stud dirt paths now cross the map from edge to edge and meet in the centre, where a 40-stud cobblestone plaza holds a round fountain: a stone basin, translucent blue water and a pillar in the middle, all anchored parts grouped in the Plaza model. The visual check judged it against your request. The paths are straight for now; curving them or adding lamps along them are good next steps.',
    mutation: { step: 3, path: 'intent', value: ' ' },
  },

  {
    id: 'scatter-forest-edge',
    family: 'map-vegetation-scatter',
    prompt: 'fill the empty grass areas with trees but not in a grid, make it look natural',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Natural tree cover',
          steps: [
            { title: 'One low-poly tree model', detail: 'Cylinder trunk and two overlapping ball canopies, grouped as a Model.', tool: 'create_instances' },
            { title: 'Scatter it on grass only', detail: 'Minimum spacing, random scale and yaw, never on paths.', tool: 'scatter_instances' },
            { title: 'Check the composition', detail: 'Clusters and gaps, not an even carpet.', tool: 'check_composition' },
          ],
        },
      },
      {
        tool: 'create_instances',
        args: { items: [{
          className: 'Model', name: 'RoundTree', parent: 'game.ServerStorage',
          children: [
            P('Part', 'Trunk', { Shape: E('Enum.PartType.Cylinder'), Size: V3(10, 2, 2), Position: V3(0, 5, 0), Orientation: V3(0, 0, 90), Color: C(0.45, 0.3, 0.18) }),
            P('Part', 'Canopy', { Shape: E('Enum.PartType.Ball'), Size: V3(10, 10, 10), Position: V3(0, 12, 0), Color: C(0.3, 0.7, 0.25) }),
            P('Part', 'Canopy2', { Shape: E('Enum.PartType.Ball'), Size: V3(7, 7, 7), Position: V3(2.5, 14, 1.5), Color: C(0.4, 0.8, 0.3) }),
          ],
        }] },
      },
      { tool: 'scatter_instances', args: { template: 'game.ServerStorage.RoundTree', count: 45, region: { min: [-95, -10, -95], max: [95, 40, 95] }, onMaterial: ['Grass'], minSpacing: 12, scale: [0.8, 1.3], randomYaw: true, seed: 11, parent: 'game.Workspace' } },
      { tool: 'check_composition', args: { subject: 'scene', intent: 'trees filling the grass areas naturally, not in a grid' } },
    ],
    reply: 'I built one low-poly tree (a brown cylinder trunk with two overlapping green ball canopies in two shades) and scattered 45 copies onto grass only, at least 12 studs apart, each randomly scaled 0.8 to 1.3 and turned, so the dirt paths stay clear and it does not read as a grid. The template is kept in ServerStorage. The composition check ran on the scene; if an area still looks bare, I can add rocks and bushes the same way.',
    mutation: { step: 2, path: 'count', value: '45' },
  },

  {
    id: 'fence-along-path',
    family: 'map-fence-line',
    prompt: 'add a wooden fence along the side of the main path',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Path fence',
          steps: [
            { title: 'Posts every 8 studs with two rails', detail: 'Light-wood parts grouped as one Fence model, just off the path edge.', tool: 'create_instances' },
            { title: 'Audit the build', detail: 'Everything anchored and parented.', tool: 'audit_build' },
          ],
        },
      },
      {
        tool: 'create_instances',
        args: { items: [{
          className: 'Model', name: 'PathFence', parent: 'game.Workspace',
          children: [
            ...[0, 8, 16, 24, 32].map((z, i) => P('Part', `Post${i + 1}`, { Size: V3(1, 4, 1), Position: V3(7, 6, z), Color: C(0.72, 0.53, 0.33), Material: E('Enum.Material.Wood') })),
            P('Part', 'RailTop', { Size: V3(0.5, 0.5, 33), Position: V3(7, 7.2, 16), Color: C(0.78, 0.6, 0.4), Material: E('Enum.Material.Wood') }),
            P('Part', 'RailLow', { Size: V3(0.5, 0.5, 33), Position: V3(7, 5.5, 16), Color: C(0.78, 0.6, 0.4), Material: E('Enum.Material.Wood') }),
          ],
        }] },
      },
      { tool: 'audit_build', args: {} },
    ],
    reply: 'PathFence runs 32 studs along the east edge of the main path: five wooden posts 8 studs apart joined by a top and a lower rail, in two light wood tones, anchored and grouped as one model. The audit ran over the build. Post heights assume the path sits at about Y 4; if the ground rolls there, tell me and I will drop each post onto the terrain.',
    mutation: { step: 1, path: 'items.0.children.0.props.Size', value: { t: 'Vec3', v: [1, 4, 1] } },
  },

  // --------------------------------------------------------------------------------- props
  {
    id: 'low-poly-pine',
    family: 'props-lowpoly-pine',
    prompt: 'make me a stylized low poly pine tree i can reuse around the map',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Low-poly pine',
          steps: [
            { title: 'Trunk and three stacked tiers', detail: 'Cylinder trunk; square tiers shrinking upward, each turned 45 degrees from the one below.', tool: 'create_instances' },
            { title: 'Check it as a prop', detail: 'Reads as a pine from a distance.', tool: 'check_composition' },
          ],
        },
      },
      {
        tool: 'create_instances',
        args: { items: [{
          className: 'Model', name: 'PineTree', parent: 'game.Workspace',
          children: [
            P('Part', 'Trunk', { Shape: E('Enum.PartType.Cylinder'), Size: V3(6, 1.6, 1.6), Position: V3(0, 3, 0), Orientation: V3(0, 0, 90), Color: C(0.42, 0.28, 0.16) }),
            P('Part', 'Tier1', { Size: V3(10, 3, 10), Position: V3(0, 7, 0), Color: C(0.13, 0.45, 0.25) }),
            P('Part', 'Tier2', { Size: V3(7, 3, 7), Position: V3(0, 10, 0), Orientation: V3(0, 45, 0), Color: C(0.16, 0.52, 0.28) }),
            P('Part', 'Tier3', { Size: V3(4, 3, 4), Position: V3(0, 13, 0), Color: C(0.2, 0.6, 0.32) }),
          ],
        }] },
      },
      { tool: 'check_composition', args: { target: 'game.Workspace.PineTree', subject: 'prop', intent: 'a stylized low poly pine tree to reuse' } },
    ],
    reply: 'PineTree is one model: a brown cylinder trunk under three dark-to-light green tiers that shrink from 10 to 4 studs as they go up, the middle one turned 45 degrees so the silhouette is jagged rather than a stack of boxes. Everything is smooth plastic and anchored. The prop check ran on it. To reuse it, scatter it onto grass the way the tree fill does, or tell me where you want copies.',
    mutation: { step: 1, path: 'items.0.children.0.props.Shape', value: 'Cylinder' },
  },

  {
    id: 'lamp-post-glow',
    family: 'props-lamp-post',
    prompt: 'i want street lamps that actually glow at night',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Glowing lamp',
          steps: [
            { title: 'Post, arm and neon head with a light', detail: 'Dark post, warm neon head, PointLight range 14.', tool: 'create_instances' },
            { title: 'Night to see it', detail: 'Night mood so the glow reads.', tool: 'set_mood' },
            { title: 'Look at it', detail: 'Judge the glow against the request.', tool: 'inspect_visually' },
          ],
        },
      },
      {
        tool: 'create_instances',
        args: { items: [{
          className: 'Model', name: 'StreetLamp', parent: 'game.Workspace',
          children: [
            P('Part', 'Post', { Shape: E('Enum.PartType.Cylinder'), Size: V3(12, 0.8, 0.8), Position: V3(10, 6, 0), Orientation: V3(0, 0, 90), Color: C(0.15, 0.15, 0.18) }),
            P('Part', 'Base', { Size: V3(2, 1, 2), Position: V3(10, 0.5, 0), Color: C(0.2, 0.2, 0.24) }),
            P('Part', 'Head', { Shape: E('Enum.PartType.Ball'), Size: V3(2, 2, 2), Position: V3(10, 12.5, 0), Color: C(1, 0.85, 0.5), Material: E('Enum.Material.Neon') }, [
              { className: 'PointLight', name: 'Glow', props: { Range: N(14), Brightness: N(1.5), Color: C(1, 0.8, 0.5) } },
            ]),
          ],
        }] },
      },
      { tool: 'set_mood', args: { mood: 'night' } },
      { tool: 'inspect_visually', args: { target: 'game.Workspace.StreetLamp', intent: 'a street lamp that actually glows at night' } },
    ],
    reply: 'StreetLamp is a dark cylinder post on a small base with a warm neon ball on top, and a PointLight inside the head (range 14, brightness 1.5, warm colour) so it lights the ground around it and not just itself. I switched the place to the night mood so the glow can be judged, and looked at it. Say if you want the day mood back; the lamp keeps glowing either way. Tell me the path and I will place copies every 25 studs along it.',
    mutation: { step: 2, path: 'mood', value: 'midnight' },
  },

  {
    id: 'striped-market-stall',
    family: 'props-market-stall',
    prompt: 'build a little market stall with a striped awning and a sign',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Market stall',
          steps: [
            { title: 'Counter, posts, striped awning, sign', detail: 'Parts in one model; alternating two-colour awning strips; SurfaceGui sign with a stroked cartoon font.', tool: 'create_instances' },
            { title: 'Check it as a prop', detail: 'Purpose readable from its silhouette and sign.', tool: 'check_composition' },
          ],
        },
      },
      {
        tool: 'create_instances',
        args: { items: [{
          className: 'Model', name: 'MarketStall', parent: 'game.Workspace',
          children: [
            P('Part', 'Counter', { Size: V3(12, 3, 4), Position: V3(0, 1.5, 0), Color: C(0.7, 0.5, 0.3), Material: E('Enum.Material.Wood') }),
            P('Part', 'PostL', { Size: V3(0.8, 8, 0.8), Position: V3(-5.6, 4, -1.6), Color: C(0.55, 0.38, 0.22), Material: E('Enum.Material.Wood') }),
            P('Part', 'PostR', { Size: V3(0.8, 8, 0.8), Position: V3(5.6, 4, -1.6), Color: C(0.55, 0.38, 0.22), Material: E('Enum.Material.Wood') }),
            ...[-5, -3, -1, 1, 3, 5].map((x, i) => P('Part', `Stripe${i + 1}`, { Size: V3(2, 0.3, 6), Position: V3(x, 8.4, 0.4), Orientation: V3(15, 0, 0), Color: i % 2 ? C(1, 1, 1) : C(0.9, 0.2, 0.2) })),
            P('Part', 'Sign', { Size: V3(8, 2, 0.4), Position: V3(0, 9.8, -1.6), Color: C(0.95, 0.85, 0.6) }, [
              { className: 'SurfaceGui', name: 'Label', props: { Face: E('Enum.NormalId.Front') }, children: [label('Text', 'MARKET', 'Enum.Font.FredokaOne', U2(1, 0, 1, 0), { TextColor3: C(0.6, 0.15, 0.1) })] },
            ]),
          ],
        }] },
      },
      { tool: 'check_composition', args: { target: 'game.Workspace.MarketStall', subject: 'prop', intent: 'a little market stall with a striped awning and a sign' } },
    ],
    reply: 'MarketStall is a wooden counter between two posts under an awning of six alternating red and white strips tilted 15 degrees, with a cream sign above reading MARKET in FredokaOne with an outline. It is all anchored parts in one model. The prop check ran on it. The sign faces the counter side; if it faces the wrong way in your layout, I will rotate the whole model.',
    mutation: { step: 0, path: 'steps.1.tool', value: 'render_view' },
  },

  // ------------------------------------------------------------------------------ lighting
  {
    id: 'bright-stylized-light',
    family: 'lighting-bright-stylized',
    prompt: 'the lighting is grey and flat, make it bright and vibrant like a cartoon game',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Bright stylised lighting',
          steps: [
            { title: 'Sunny base', detail: 'The sunny mood as the complete starting setup.', tool: 'set_mood' },
            { title: 'Vibrancy and depth', detail: 'Light atmosphere haze, a saturation lift and low bloom under Lighting.', tool: 'create_instances' },
            { title: 'Look at it', detail: 'Shadows visible, colours vivid, background separated.', tool: 'inspect_visually' },
          ],
        },
      },
      { tool: 'set_mood', args: { mood: 'sunny' } },
      {
        tool: 'create_instances',
        args: { items: [
          { className: 'Atmosphere', name: 'StylizedAir', parent: 'game.Lighting', props: { Density: N(0.3), Haze: N(0.5), Color: C(0.78, 0.86, 1) } },
          { className: 'ColorCorrectionEffect', name: 'Vibrance', parent: 'game.Lighting', props: { Saturation: N(0.2), Contrast: N(0.1) } },
          { className: 'BloomEffect', name: 'SoftBloom', parent: 'game.Lighting', props: { Intensity: N(0.4), Threshold: N(2) } },
        ] },
      },
      { tool: 'inspect_visually', args: { intent: 'bright, vibrant cartoon-game lighting instead of grey and flat' } },
    ],
    reply: 'I applied the sunny mood as the base, then added a light blue atmosphere (density 0.3) so distance fades into a soft haze, a colour correction that lifts saturation by 0.2 and contrast by 0.1, and a low bloom that only makes the brightest surfaces glow. The visual check looked at the whole place against your request. If it is too saturated for your art, lowering Vibrance.Saturation to 0.1 is the one knob to turn.',
    mutation: { step: 2, path: 'items.1.props.Saturation', value: { t: 'num', v: 0.2 } },
  },

  {
    id: 'golden-hour-cozy',
    family: 'lighting-golden-warm',
    prompt: 'give the place a warm cozy sunset feeling',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Golden hour',
          steps: [
            { title: 'Golden mood', detail: 'The golden preset: low warm sun, long shadows.', tool: 'set_mood' },
            { title: 'See it from the hero angle', detail: 'Render before judging.', tool: 'render_view' },
            { title: 'Look at it', detail: 'Judge warmth against the request.', tool: 'inspect_visually' },
          ],
        },
      },
      { tool: 'set_mood', args: { mood: 'golden' } },
      { tool: 'render_view', args: { view: 'hero' } },
      { tool: 'inspect_visually', args: { intent: 'a warm cozy sunset feeling' } },
    ],
    reply: 'The place is on the golden mood now: a low, warm sun with long soft shadows and an orange-tinted sky. I rendered it from the hero angle and ran the visual check against "warm and cozy". Lamps with warm point lights along the paths would add to the cozy feeling once the sun is this low.',
    mutation: { step: 2, path: 'view', value: 'sunset' },
  },
];
