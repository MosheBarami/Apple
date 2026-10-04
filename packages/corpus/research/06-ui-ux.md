# UI/UX for Roblox (mobile-first layout, safe areas and top bar, constraints, fonts, accessibility, patterns)
_Researched 2026-10-04 by Claude (deep researcher, topic 06-ui-ux). Sources: 99 (S1-S88, plus S89-S99 added in the gap pass)._
_Gap pass 2026-10-04: 8 items resolved, 8 still open._

How to read this file. "Verified" means I read the page text of the cited source on 2026-10-04. API reference pages were read
from the Roblox creator-docs repository (raw files on GitHub, branch main, which is the source of create.roblox.com/docs) and a few
directly on create.roblox.com. Numbers marked "third-party" come from blogs/analytics, not Roblox. Numbers marked "judgement"
are my recommended defaults for an AI builder, not Roblox rules. Anything I could not confirm is under "Open questions".

## Key facts

### Device split and what it implies
- Roblox's own creator guidance says most users play on mobile and tells creators to design UI and gameplay for mobile first, with
  gamepad shortcuts and keyboard keys layered on for console and desktop [S28].
- Device split from Roblox's own filings (gap pass; the percentages are only in a pie-chart image titled "Breakdown of Our Users", "By Platform", which I read from the image files in the filings; the filing text has none): FY2024 average DAUs = 80% mobile, 17% desktop, 3% console [S90]; FY2025 average DAUs = 83% mobile, 14% desktop, 3% console [S89]. That is the 2025 vs 2024 shift: mobile up 3 points, desktop down 3. The press figure of 80/17/3 for 2024 (PocketGamer.biz and Gameranx, 2025-04-23) matches the FY2024 chart [S80][S81][S90]. FY2025 context: 127M average DAUs, 123.9B hours, 2.7 hours per DAU per day [S78]. The Q4 2025, Q1 2026 and Q2 2026 shareholder letters give no device split (they only talk about reaching low-end phones and high-end PCs), so there is no verified 2026 split yet [S98].
- Third-party sources disagree (and the 83/14/3 filing figure supersedes them): RoWatcher quotes 80/17/3 for "Q4 2025" without attribution, which is the FY2024 figure [S83]; ROLearn (2026-02-05) claims
  60% mobile, 20% desktop, 15% console, 5% VR with no source [S84]; SpawnBlox says "over 70%" mobile [S86]; KitsBlox says "over 60%" [S87].
  Do not quote any of these as fact. Safe statement: the large majority of Roblox sessions are on phones and tablets.
- Revenue does not follow the player split: only 46% of 2024 Robux revenue came through the Apple and Google stores (30% Apple, 16% Google
  Play) while mobile was about 80% of players, so PC and console players monetize through the web/other channels at a higher per-user rate
  (press citing the annual report) [S80]. Do not neglect PC/console UI.
- Platform scale in 2026: 123M DAU and 29B hours engaged in Q2 2026 (up 10% and 5% year over year), 27M average monthly unique payers (up 15%); verified in the Q2 2026 shareholder letter PDF in the gap pass [S82][S98].
- Roblox's docs split viewport sizes into three buckets via GuiService.ViewportDisplaySize: Small (most tablets, phones, handhelds), Medium
  (most laptops and monitors), Large (TVs and larger) [S1][S8].

### Screen model: ScreenGui, insets, safe areas
- ScreenGui defaults (verified): ScreenInsets = CoreUISafeInsets, IgnoreGuiInset = false, ClipToDeviceSafeArea = true,
  SafeAreaCompatibility = FullscreenExtension [S3].
- Enum.ScreenInsets has four values: None (0), DeviceSafeInsets (1), CoreUISafeInsets (2), TopbarSafeInsets (3) [S2].
  - None: no insets; content can sit under notches and the top bar. Use only for non-interactive full-bleed backgrounds [S2][S4].
  - DeviceSafeInsets: avoids camera notches/cutouts but NOT the Roblox top bar buttons [S2].
  - CoreUISafeInsets (default): avoids both cutouts and the top bar buttons. Roblox recommends it for any ScreenGui with buttons or status
    messages [S2][S4].
  - TopbarSafeInsets: the ScreenGui area becomes the free strip of the top bar to the right of the experience controls; its width
    changes automatically as the controls change [S2][S4].
- GuiService.GetInsetArea(Enum.ScreenInsets) returns a Rect for that inset area; GuiService.GetGuiInset() returns two Vector2 (top-left
  and bottom-right inset in pixels), only meaningful for ScreenGuis with IgnoreGuiInset = false [S1].
- GuiService.TopbarInset (Rect, read-only) is the unoccupied area between Roblox's left-most controls and the device safe-area edge; it changes
  when the menu opens, health/CoreGui settings change or controls move, so listen with GetPropertyChangedSignal [S1][S64].
  Coordinate space (gap pass): the reference does not name one, but its official code sample creates a ScreenGui with IgnoreGuiInset = true and
  assigns `Position = UDim2.new(0, inset.Min.X, 0, inset.Min.Y)` and `Size = UDim2.new(0, inset.Width, 0, inset.Height)` straight from the Rect, so treat
  it as pixel coordinates in full-screen space (an IgnoreGuiInset ScreenGui) [S94]. The Enum.ScreenInsets docs say all inset values are relative to the
  fullscreen area, while `GuiService:GetInsetArea(...)` returns a Rect relative to the CoreUISafeInsets area (its example for None returns negative
  top-left values such as -59, -58) [S1][S94]. Do not mix the two without converting.
- Do not hardcode the top bar height. It was 36 px in 2020 [S63]. A 2025-03 DevForum thread says the old 36 is wrong and the real value "might be
  44 or 48" and that GetGuiInset() is the fix [S65]. Third-party guides still repeat "about 36" [S85][S86]; treat that as stale.
- Experience controls redesign (announced 2024-06-18, rolled out; "now live" post 2024-10-15 by Roblox staff workbloxing): a left-aligned
  hamburger menu (Report Abuse, Self View, Capture, Leaderboard, Emotes, Inventory, Respawn) plus persistent chat and microphone icons; icons are 44 px
  to meet WCAG 2.1 AAA target size; reserved width varies with enabled communication features and on portrait phones the controls can span the
  whole width; creators cannot disable or move them; launched on all platforms except console and VR (planned later) [S61][S62].
  Roblox's instruction to developers: use TopbarSafeInsets and the TopbarInset change signal or UI may overlap the controls [S61][S62].
- 2025-2026 top bar maintenance: a Studio regression with ScreenInsets = TopbarSafeInsets (reported 2025-11-05, from a top bar performance change)
  was fixed by staff within hours the same day, and only affected Studio, not live games [S66]. A report from 2025-12-02 says TopbarSafeInsets sizes
  wrongly on console emulation (Xbox One) with no staff answer in the thread text I could read [S67]. An older report (2024-02-22, mvyasu) about the same
  symptom on Xbox One and PS4 emulation (PS5 fine) was still reproducible on 2025-09-19; on 2025-11-21 a staff member (romuelas) said the team believes
  it is resolved and that console emulation should not contain the new experience controls, and asked whether it still happens; the Dec 2025 report above
  came after that, so a fix is not confirmed [S95]. Docs page for ScreenInsets was updated on 2026-01-08 to link
  TopbarSafeInsets to TopbarInset [S68]. I found no new 2025-2026 top bar redesign announcement; the last structural change I could verify is the Oct 2024 controls update [S61].
- Notched screens (full release 2022-12-08): ScreenGuis with IgnoreGuiInset = false use the core UI safe area, those with true use the device safe
  area; ClipToDeviceSafeArea clips children outside the device safe area; FullscreenExtension expands a full-safe-area background to the full screen
  while content stays inset [S60]. SafeAreaCompatibility = FullscreenExtension is described in the enum docs as for legacy UI; use ScreenInsets for new work [S6].
- Core UI that you must plan around (default-on, toggle with StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.X, false) from a client script): PlayerList, Health
  (hidden at full health), Backpack (hidden when empty), Chat, EmotesMenu, SelfView, Captures, AvatarSwitcher. The top bar itself cannot be disabled
  with SetCoreGuiEnabled [S5][S44].
- Touch controls (virtual thumbstick and jump button) are on by default on touch devices; GuiService.TouchControlsEnabled = false removes them [S5][S1].
- StarterGui.ScreenOrientation: default is landscape (LandscapeSensor); options are LandscapeSensor, Sensor, LandscapeLeft, LandscapeRight, Portrait; change at
  runtime on PlayerGui.ScreenOrientation, watch CurrentScreenOrientation [S30].

### Scale vs Offset, constraints, layouts
- Position and Size are UDim2 = (Scale, Offset) per axis, and the two add; AnchorPoint (0..1) sets the origin the object grows from. Roblox's
  Studio shorthand: typing 0.5 means scale, typing 20 means offset [S9].
- ZIndex: with the default ZIndexBehavior, children always render above parents and ZIndex orders siblings; DisplayOrder orders ScreenGuis (higher in front) [S9][S10].
  CanvasGroup flattening requires the ancestor ScreenGui to use ZIndexBehavior Sibling [S42].
- Layout containers: UIListLayout (rows/columns), UIGridLayout (uniform cells), UITableLayout, UIPageLayout (tabbed pages); layouts override children's Position and
  usually Size [S9][S13][S11].
- UIListLayout flex (verified): FillDirection, SortOrder (LayoutOrder or Name), Padding (UDim), Wraps (bool), HorizontalFlex/VerticalFlex (UIFlexAlignment: None, Fill,
  SpaceAround, SpaceBetween, SpaceEvenly), ItemLineAlignment (e.g. Stretch); UIFlexItem child with FlexMode Grow (1:0), Shrink (0:1), Fill (1:1) or Custom (GrowRatio, ShrinkRatio) [S11][S39][S47].
- UIGridLayout defaults: CellSize {0,100},{0,100}; CellPadding {0,5},{0,5}; FillDirectionMaxCells 0; StartCorner, FillDirection, SortOrder [S46].
- UIAspectRatioConstraint: AspectRatio (default 1, width/height, must be > 0), AspectType (FitWithinMaxSize or ScaleWithParentSize), DominantAxis (Width or Height) [S12][S40].
  It overrides layout sizing, so a Scale-sized child with an aspect constraint is the standard way to keep icons and square buttons square [S12].
- UISizeConstraint: MinSize/MaxSize in pixels; overrides layouts. Roblox's own tutorials cap a button at height 44 and a HUD meter at height 20, and clamp the settings panel to
  MaxSize 800 wide / MinSize 350 [S34][S35].
- UITextSizeConstraint: MinTextSize default 1, MaxTextSize default 1000; Roblox says do not use a MinTextSize below 9 [S41][S12].
- UIScale multiplies the parent's AbsoluteSize (Scale 0.5 halves it) and suits design zoom and hover/press animation [S43][S12].
- AutomaticSize (None, X, Y, XY) sizes a GuiObject to its content and treats Size as a minimum; ScrollingFrame uses AutomaticCanvasSize instead [S12][S45].
- ScrollingFrame: CanvasSize (UDim2), AutomaticCanvasSize, ScrollBarThickness (int px), ScrollingDirection, ElasticBehavior (touch devices bounce by default; set Never to stop it),
  VerticalScrollBarInset to stop content sliding under the bar, scroll-bar images TopImage/MidImage/BottomImage [S14][S45].
- SurfaceGui (face UI on a part) and BillboardGui (always faces camera, Size scale = studs); buttons in a SurfaceGui only receive input if the SurfaceGui is under PlayerGui; MaxDistance default 1000 [S58].
- UIStroke: Thickness (px by default), ApplyStrokeMode (Contextual or Border), LineJoinMode (Round default, Bevel, Miter), BorderStrokePosition (Center, Inner, Outer), Color supports a UIGradient child [S38].
- UICorner: CornerRadius (UDim) plus per-corner TopLeftRadius, TopRightRadius, BottomLeftRadius, BottomRightRadius. The API page still labels per-corner radii "beta", but the DevForum recap of
  2026-06-26 says UICorner individual corners and UIShadow are fully released and the "New UI Capabilities" beta flag is removed [S37][S76]. Trust the recap; the reference page is stale.
- UIShadow (new, GA 2026-06-26): BlurRadius (UDim), Color, Enabled (default true), Offset (UDim2), Spread (UDim2), Transparency, ZIndex; does not support text, inset shadows, Path2D, textures or UIGradient [S36][S76].
- CanvasGroup: renders descendants as a flattened group with GroupTransparency and GroupColor3; always clips; uses extra texture memory and can render blank when memory limit is hit; keep its size static [S42].
- 9-slice: ImageLabel/ImageButton ScaleType = Slice, then SliceCenter via the editor; corners never scale, edges scale on one axis, centre on both. Use it for panels and buttons that must hold localized text [S22].
- UIDragDetector gives code-free sliders and spinners (DragStyle, ResponseStyle, BoundingUI, DragRelativity; events DragStart/DragContinue/DragEnd) [S48]; Roblox's slider tutorial uses DragStyle TranslateLine, ResponseStyle Scale [S34].

### Text and fonts
- TextSize is the height of one line in offsets (pixels), not points [S16]. TextSize is capped at 100 for TextLabel as of Sept-Oct 2025 (DevForum request to raise it, no staff reply seen) [S71]. InputActionLabel allows 1-200 [S51].
- Enum.Font is a legacy API; new work should use FontFace (Datatype.Font: Family, Weight, Style) [S17][S18]. Font.fromName("BuilderSans"), Font.new("rbxasset://fonts/families/BuilderSans.json", Enum.FontWeight.Bold) etc. exist; built-in families live at rbxasset://fonts/families/<Name>.json [S18].
- Builder Font (announced 2024-03-07 by vamorafa): Builder Sans (readability), Builder Extended (expressive), Builder Mono. License limits use to creating and publishing UGC experiences on Roblox. Gotham and Arial were removed on 2024-05-28 and auto-map to Montserrat and Arimo [S70].
  Enum.Font values Gotham* map to Montserrat, Arial* to Arimo; BuilderSans, BuilderSansMedium, BuilderSansBold, BuilderSansExtraBold are enum items marked as requiring the Builder Font License [S17].
  Third-party SpawnBlox still recommends "GothamBold"; that name now silently renders Montserrat, so it is stale advice [S86][S70].
- TextScaled auto-enables TextWrapped; Roblox's own TextLabel docs recommend AutomaticSize instead of TextScaled for on-screen UI, optionally with a UITextSizeConstraint [S16]. Third-party guide agrees TextScaled shrinks to unreadable on phones [S87].
- Other TextLabel props: TextTruncate (None, AtEnd, SplitWord), LineHeight 1.0-3.0 (default 1.0), MaxVisibleGraphemes (-1 = all; used for typewriter), TextStrokeTransparency (Roblox suggests 0.75-1 for subtle outlines), OpenTypeFeatures string, TextDirection [S16].
- RichText must be enabled per object; tags: b, i, u, s, font (color, size, face, family, weight, transparency), stroke, mark, uppercase/uc, smallcaps/sc, br, comments; tags must nest properly; localization removes the markup [S23].
- Text a player types or any text you did not author must be filtered with TextService:FilterStringAsync after submission (not per keystroke); Roblox moderates experiences that skip this [S55]. TextBox: PlaceholderText, FocusLost(enterPressed) [S56].

### Accessibility and player preferences (2025 additions)
- Global Text Size setting left beta on 2025-08-27: players pick Large, Larger or Largest (Medium is default) [S77]; GuiService.PreferredTextSize exposes it as Enum.PreferredTextSize Medium(1), Large(2), Larger(3), Largest(4) [S7][S1].
  Behaviour: engine scales text; objects with TextScaled are NOT scaled by the setting; UITextSizeConstraint min/max still bound the size; AutomaticSize elements grow with the text; TextService measurement functions honor it [S33][S77].
  Developers complained about rollout without notice and RichText breakage; staff (BitwiseAndrea, 2025-09-02) acknowledged communication but did not make it opt-in [S69]. Per-object opt-out (gap pass): none exists. The current API dump has no per-object text-size property on TextLabel, TextButton or TextBox, and the docs describe no opt-out [S97][S33]. The only indirect ways out are `TextScaled = true` or a `UITextSizeConstraint` (which then bounds the size to its Min/MaxTextSize); a Sept 2025 request notes the constraint route overwrites RichText size markup, so RichText text that is not TextScaled cannot be exempted, and a staff member only asked for an example, with no change announced [S96].
  Consequence for builders: build text boxes to grow (AutomaticSize Y, TextWrapped, scroll areas), not fixed-size labels.
- GuiService.PreferredTransparency (0..1, default 1): multiply your BackgroundTransparency by it; Roblox's example tags elements "TransparentBack" via CollectionService [S33][S1].
- GuiService.ReducedMotionEnabled (bool): for players with the Reduce Motion setting, set tween time to 0 or replace movement with fades [S33][S1].
- Do not rely on colour alone (colour-blind players, about 5% globally per Roblox's page); pair colour with icon/shape; use high text contrast; give separate music/SFX volume sliders; never convey critical events by sound alone [S33].
- Roblox's UI-ux guide says keep contrast and header/body hierarchy [S27]. A WCAG-style 4.5:1 body-text contrast is quoted by a third-party guide [S86]; treat as judgement, it is the standard WCAG AA ratio, not a Roblox rule.

### Input, touch and gamepad
- Enum.PreferredInput items (gap pass): KeyboardAndMouse (0), Gamepad (1), Touch (2), MicroGamepad (3; a gamepad without a thumbstick such as a TV remote, only when no standard gamepad is connected) [S91].
- Use UserInputService.PreferredInput (read-only) rather than TouchEnabled to decide which UI to show; Roblox's property page warns TouchEnabled misleads on mixed-input devices (touch laptops, phones with a gamepad) [S49][S30]. Branch on last input (GetLastInputType / LastInputTypeChanged) or PreferredInput, not on device [S49][S85].
- Buttons: connect to Activated (works for mouse, touch, gamepad). SecondaryActivated covers right-click on desktop and long-press on mobile [S20]. GuiObject itself has no Activated; only TextButton/ImageButton do [S19].
- GuiObject touch gestures: TouchTap, TouchLongPress, TouchPan, TouchPinch, TouchRotate, TouchSwipe [S19]. Active = true makes an element sink input; InputSink (None, Activate, All) is the newer control [S19].
- Gamepad navigation: set Selectable = true; wire NextSelectionUp/Down/Left/Right; SelectionImageObject overrides the selection look; GuiService.SelectedObject / GuiService:Select(); AutoSelectGuiEnabled; GuiNavigationEnabled; CoreGuiNavigationEnabled [S19][S1][S31].
  Roblox default gamepad conventions: ButtonA confirm/primary, ButtonB cancel/secondary, Thumbstick1 move, Thumbstick2 camera, triggers primary actions [S31]. Test with Studio's Controller Emulator [S31][S32].
- Studio Device Simulator emulates screen dimensions, pixel density, on-screen keyboard and touch; Controller Emulator pairs with it [S32]. Roblox's tutorials and notched-screen post both tell you to test in it [S35][S60].
- Haptics (gap pass, full list from the API reference): HapticEffect plays vibration on iOS/Android phones that support it, PlayStation and Xbox pads and Quest Touch controllers [S50][S92]. Members: properties Looped, Position (Vector3), Radius, Type; methods Play, Stop, SetWaveformKeys (for Custom); event Ended. Enum.HapticEffectType items: Custom (0), UIHover (1; subtle, for browsing over a UI object), UIClick (2; crisp feedback for a selection), UINotification (3; attention-grabbing inbound message), GameplayExplosion (4; large lingering rumble), GameplayCollision (5; big immediate rumble that dies quickly) [S92]. The older HapticService exposes GetMotor, IsMotorSupported, IsVibrationSupported and SetMotor, with Enum.VibrationMotor items Large, Small, LeftTrigger, RightTrigger, LeftHand, RightHand [S92]. Use UIClick for button presses and UINotification for toasts.
- Mobile default control zones sit bottom-left (thumbstick) and bottom-right (jump); Roblox says keep important info and virtual buttons out of them; a button 40% down from the top is reachable on a phone but nearly unreachable on a tablet; prefer proximity prompts to permanent action buttons [S9].
- Community tutorial (Micamaster100, 2023-07-29, stale-ish): custom action buttons go in the "jump button zone", never the thumbstick zone; roughly 70 px buttons on small screens and 120 px on tablets, switching when the shorter screen axis passes 500 px; position relative to the jump button; do not detect touch via TouchEnabled [S72].
- InputActionLabel (shows the right key/button/touch glyph for an InputAction automatically) exists now; the roadmap lists a fuller "input action label" feature for early 2027 [S51][S73].
- ProximityPrompt defaults: ActionText "Interact", KeyboardKeyCode E, GamepadKeyCode ButtonX; supports ClickablePrompt for touch, HoldDuration, RequiresLineOfSight, custom Style, events Triggered, PromptButtonHoldBegan, PromptShown/PromptHidden [S53].

### Universal styling (CSS-like system) - released 2026
- UI Styling (StyleSheet, StyleRule, StyleLink, StyleDerive, tokens, themes) reached full release in Studio by the 2026-05-08 roadmap; StyleQuery was due mid-2026 and the fall roadmap lists UI shadows/glows and StyleQueries as shipped, along with individually rounded corners and styling transitions [S74][S73][S24].
- Model: StyleSheet holds rules and tokens (attributes); StyleRule has a Selector and properties that reference tokens with $TokenName; StyleLink attaches a sheet to a ScreenGui (one sheet per tree); themes are swappable token sets [S24].
- Selectors: class (TextButton), tag with dot (.ButtonPrimary, via CollectionService), name with # (#ModalFrame), child > and descendant >>, state :Hover / :Press (Enum.GuiState), pseudo-instances ::UICorner, query @ [S25].
- StyleQuery conditions: AspectRatioRange, MaxSize, MinSize, PreferredInput, PreferredTextSize, ReducedMotionEnabled, ViewportDisplaySize. Built-ins such as @ViewportDisplaySizeSmall and @ReducedMotionEnabledTrue need no definition [S52][S25].
- Compatible classes include GuiObject family, TextBox, ScrollingFrame, ViewportFrame, Path2D, CanvasGroup, InputActionLabel, UICorner, UIGradient, UIPadding, UIShadow, UIStroke, list/grid/page layouts, and the size constraints incl. UIFlexItem [S26].

### 2026 UI roadmap (plan for what's coming)
- Shipped by 2026-09-18: individually rounded corners, styling transitions, UI shadows and glows, StyleQueries [S73].
- Announced for late 2026: 2D particles in UI, animated image containers, input action manager, orthographic camera, upgraded UI gradients (radial, conic, tile modes); early 2027: input action label, UI blur (backdrop blur in screen space) [S73][S75].
- Do not use features that are only roadmapped (UI blur, radial/conic gradients). Use CanvasGroup, UIGradient (linear) and UIShadow today.

### UX principles from Roblox's own design guide (verified) [S27][S28][S29]
- Five UI principles: prioritisation, attention (colour, size, space, proximity, movement, in moderation), visual language (consistent icons, button containers, text hierarchy, written style guide), conventions (X closes, grey = unusable, lock icon = locked), consistency.
- Examples named in the guide: Spellbound RPG (minimal mobile UI, sub-buttons appear only when parent button chosen); Super Striker League (buttons swap contextually: Sprint/Tackle without ball, Deke/Pass with ball); Jailbreak (golden stripe under season-pass-only icons); Dragon Adventures (best coin bundle drawn larger with more padding); Tower Defense Simulator (size and proximity group daily skins vs daily crates); Winds of Fortune, BotClash Simulator, DOORS (X close buttons); Arcane Odyssey (health always green); Berry Avenue RP (avatar flow: Avatar button, category, scroll, tap item, Done).
- Consistency rules the guide lists: close buttons always square, red with white X, top-right; unaffordable prices in red; stat colour identical everywhere [S27].
- Feedback: hover/pressed/released colour changes, a purchase sound, progress bars; missing feedback leaves players unsure [S27].
- Younger players favour mobile/tablet and are reading-averse: use visuals over walls of text, familiar patterns (bottom-screen inventory slots), consistent iconography for international audiences, avoid clashing with chat and player list [S27][S28].
- Onboarding: first minutes decide D1 retention; teach controls and the core loop, get to fun quickly (low first level thresholds, starter currency), show short/mid/long goals [S29].

## How to apply it (rules for an AI builder)

### Structure and layout
- DO build every screen as: ScreenGui (ResetOnSpawn false for persistent HUD; ScreenInsets CoreUISafeInsets, which is the default; explicitly set it anyway) > full-size Frame container > content. DON'T put interactive UI in a ScreenGui with ScreenInsets None.
- DO use ScreenInsets = None only for non-interactive background art or vignette overlays; DO use DeviceSafeInsets only when you place your own widgets in the top-bar area, and then pad away from the top bar yourself (Roblox's HUD tutorial does exactly this with UIPadding) [S35][S2].
- DO position with Scale plus AnchorPoint; reserve Offset for gaps, strokes, corner radii and icon padding. Centered modal: AnchorPoint (0.5,0.5), Position (0.5,0,0.5,0), Size about (0.75,0,0.75,0) as in Roblox's settings-menu tutorial [S34].
- DO add to every panel: UIAspectRatioConstraint (to hold shape) and UISizeConstraint (MaxSize like 800 px wide so it does not balloon on 4K/TV; MinSize like 350 px wide so it does not collapse on small phones) [S34][S12].
- DON'T hardcode pixel positions or sizes for panels; DON'T hardcode the top bar height (use ScreenInsets or GuiService:GetGuiInset()/TopbarInset) [S65].
- DO leave the bottom-left and bottom-right corners (thumbstick, jump button) free on touch; put custom action buttons above/left of the jump button inside the jump zone, never in the thumbstick zone [S9][S72].
- DO use UIListLayout/UIGridLayout/UIPageLayout rather than manual positions; set SortOrder = LayoutOrder and give every child a LayoutOrder (shop item order must be deterministic).
- DO use UIFlexItem (FlexMode Fill) for rows where one element absorbs spare width (e.g. a title that grows next to a fixed close button) [S39].
- DO make long lists a ScrollingFrame with AutomaticCanvasSize = Y, ScrollingDirection = Y, ScrollBarThickness 6-10 px (judgement; docs give no default), VerticalScrollBarInset set so content never slides under the bar [S45][S14].

### Touch targets and text sizes (concrete numbers)
- Touch target minimum: 44 x 44 px rendered size. Source: Roblox sizes its own experience-control icons at 44 px for WCAG AAA target size [S61]; Roblox's tutorial caps a button at 44 px high [S34]; third-party guides cite Apple's 44 pt and Android's 48 dp [S85][S87] (Apple/Android pages not fetched by me).
- Judgement defaults: primary actions (Buy, Play, Claim) 56 px high minimum on phones, secondary 44-48 px, spacing between adjacent targets at least 8 px, a visible edge margin of about 16 px from the safe area. Make the hit area (the Active GuiButton) larger than the visible icon if the art is small.
- The rendered size is what counts: with Scale sizing, verify pixel size in the Device Simulator at a small phone (about 360-400 px short side), not in the 1080p editor viewport [S32][S85].
- Text sizes (TextSize in px, judgement unless noted): body and labels >= 16 (third-party guides say 14-18 for body [S87]; ROLearn says 14 minimum [S84]); button labels 18-24; panel titles 24-32; big numbers (currency, damage) 28-48; absolute floor 12 for anything meant to be read. Roblox's only hard number is MinTextSize >= 9 in UITextSizeConstraint [S41]. Hard limit: TextSize 100 [S71].
- Prefer AutomaticSize + TextWrapped over TextScaled so the player Text Size setting works; if you must use TextScaled, add UITextSizeConstraint with MinTextSize about 14 and MaxTextSize about 40 (judgement) [S16][S33].
- DO keep text strokes subtle (UIStroke 1-2 px for text over busy backgrounds, judgement; third-party agrees [S86]) and use TextStrokeTransparency 0.75-1 when using the old property [S16].
- DO use one font family for body and at most one display font for titles. Pick FontFace Builder Sans (readable, license limits it to Roblox use) or Montserrat/Roboto/Source Sans families; do not reference Gotham or Arial by name since they are removed and auto-substituted [S70][S18].
- DO NOT show raw long numbers: abbreviate currency (1.2K, 3.4M, 5.6B) and keep a fixed-width label so the HUD does not jitter (judgement; common practice in top simulators, not verified by a source).

### Safe areas and top bar
- DO treat the top-left as Roblox's: hamburger, chat and mic icons, 44 px, with variable width; on portrait phones the controls may take the whole width [S61]. Put your top HUD below the top bar (CoreUISafeInsets does this) or in the TopbarSafeInsets strip if it is a compact widget.
- DO listen for TopbarInset changes if you manually place UI near the top bar [S1][S64].
- DO NOT assume TopbarSafeInsets works in console emulation; as of Dec 2025 there is an open console report [S67]. Provide a fallback for console: CoreUISafeInsets plus a fixed top margin.
- DO use IgnoreGuiInset only for legacy; prefer ScreenInsets [S6][S60].

### Input and platform adaptation
- DO branch on PreferredInput or last input type, not TouchEnabled; re-run layout when it changes [S49].
- DO give every interactive control a gamepad path: Selectable = true, NextSelection links for irregular layouts, set GuiService.SelectedObject to the default button when a screen opens, clear it when closed; keep default-gamepad meaning of A/B [S31][S1][S85].
- DO prefer Activated over MouseButton1Click (Activated covers touch and gamepad too) [S20].
- DO add contextual buttons that appear only when relevant (Super Striker League pattern), and ProximityPrompts instead of permanent "interact" buttons [S27][S9].
- DO support console-sized displays: ViewportDisplaySize Large means TV; 10-foot readability suggests larger text and 5%+ safe margins on console (judgement).
- DON'T cover the centre of the screen on phones; on a landscape phone, a modal should use at most about 75-80% of height.

### Animation and feedback
- DO animate with TweenService:Create(instance, TweenInfo.new(time, style, direction), {props}); tweenable types include numbers, booleans, UDim2, UDim, Color3, Vector2, Vector3, CFrame, Rect, enums; two tweens on the same property cancel the earlier one [S54][S21].
- Typical timings (judgement, partly from a third-party guide [S86]): press feedback 0.08-0.12 s; panel open/close 0.2-0.35 s (Quad/Back Out for opens, Quad In for closes); toast fade 0.3 s, visible 3 s; number count-up 0.4-0.8 s.
- DO respect GuiService.ReducedMotionEnabled: set durations to 0 or swap to fades [S33].
- DO use GroupTransparency on a CanvasGroup to fade a whole panel without per-child overlap artifacts; keep its size static [S42]. If memory is tight, tween each child's transparency instead.
- DO use UIScale tweens (1 to 1.05 hover, 1 to 0.95 press) for button juice; they scale layout bounds too, so put the UIScale on the visual child [S43].
- DO provide immediate visual + audio feedback for every purchase and reward (Roblox guide: "cha-ching" confirmation, bars fill) [S27].

### Shop, inventory, currency, notifications (patterns)
- Shop: tabs along one edge, a scrolling grid of cards, one featured/best-value card made larger (Dragon Adventures), a price in a coloured pill (red when unaffordable, per Roblox's consistency example), a confirm step for Robux purchases, a clear X top-right [S27]. Premium or limited items marked with a distinct accent such as a gold stripe (Jailbreak) [S27].
- Inventory: grid of equal cells (UIGridLayout with square cells, or flex-wrap list) in a ScrollingFrame, equipped item marked with a UIStroke or check icon, tap to select then a detail pane, not hover tooltips (no hover on touch) [S13][S14].
- Currency: persistent top or side HUD pill with icon + abbreviated number; count-up tween on change; "+N" floating text for gains; never place under the top bar controls [S61].
- Notifications: a vertical UIListLayout stack anchored to a safe corner, each toast auto-dismisses at about 3 s, cap the stack at 3-4 entries, and use Roblox's SendNotification only for system-style messages (StarterGui:SetCore("SendNotification") and GuiService:SendNotification exist) [S44][S1][S86].
- Daily reward/popup flows: a single modal, one primary button; avoid stacking multiple modals at join (judgement; supported by onboarding guidance to "get to the fun quickly") [S29].

### UI art styles (what to pick, with Roblox-documented examples)
- Roblox's guide praises these directions: minimal mobile-friendly UI with contextual reveals (Spellbound RPG), strong colour accenting for premium (Jailbreak), colour/size hierarchy for monetized offers (Dragon Adventures, TDS), consistent container-and-shadow buttons with a tactile 3D feel (BotClash Simulator), consistent stat colours and conventional X buttons (Arcane Odyssey, DOORS, Winds of Fortune) [S27].
- Style families for an AI builder to choose between (my synthesis from the property set above; I did not verify specific top-game UI breakdowns, see Open questions):
  1. Chunky cartoon (simulators, tycoons, pet games): saturated flat fills, UIGradient top-lighter, UIStroke 2-4 px dark outline, UICorner radius 8-16 px, UIShadow for lift, bold display font.
  2. Clean flat/minimal (hangout, RPG): 2-3 colour palette, UICorner 6-12 px, subtle strokes, Builder Sans or Source Sans, generous padding.
  3. Dark translucent/glass-lite (shooters, horror, battlegrounds): background colour near (20,20,30) at BackgroundTransparency 0.2-0.4, thin accent stroke, small caps headers; use PreferredTransparency multiplication [S33].
  4. Pixel/retro: ImageLabels with `ResampleMode = Enum.ResamplerMode.Pixelated` (nearest-neighbour filtering; the default `Default` is bilinear; verified: `ImageLabel.ResampleMode` exists and the enum has exactly those two items [S93]), sharp corners (no UICorner), monospace/pixel fonts.
- What hit games actually ship (low trust, unopened search-result snippets of marketplace UI-pack listings, 2025-2026, not developer posts): a Grow a Garden-style pack lists frames for Seed Shop, Limited Shop, Pet/Cosmetic Shop, HUD, Inventory, Hotbar, Notification, Quests, Codes, Confirmation and Settings, with a horizontal hotbar of 8-10 slots mapped to number keys; a Steal a Brainrot-style pack lists Shop, Currencies, Upgrades, Trading, Spin Wheel, Rebirth, Collection Index, Skins Selector, Mystery Merchant, Sell Confirmation, Settings and HUD; a 2026 trend article snippet calls "stud" style UI (studded textures, vibrant gradients, outlined text) dominant for simulators and pet games [S99]. A DevForum thread (ProbablyGavin, 2025-06-20) shows the Grow a Garden-style stud look is built from a tiled ImageLabel texture tinted with ImageColor3, with no pixel sizes given [S99]. This tells you which screens to build, not their exact layout.
- Keep a written style guide as attributes/tokens: primary, secondary, danger, success colours; radius, stroke, padding scale; font sizes. In 2026 Roblox's StyleSheet tokens do this natively [S24][S27].

## Recipes (each becomes a skill)

### 1. Responsive ScreenGui skeleton (phone to TV)
When to use: the first step of any new screen or HUD.
Steps:
1. Create ScreenGui "Hud" in StarterGui. Set ResetOnSpawn = false, ScreenInsets = CoreUISafeInsets, IgnoreGuiInset = false, ZIndexBehavior = Sibling, DisplayOrder = 1 (modals use 10) [S3][S10].
2. Child Frame "Safe": Size (1,0,1,0), BackgroundTransparency = 1, AnchorPoint (0,0), Position (0,0,0,0). All widgets live inside it.
3. Add UIPadding to Safe with 0.01 scale or 8 px edges for breathing room (judgement).
4. Build panels with AnchorPoint + Scale position; add UIAspectRatioConstraint and UISizeConstraint to each panel.
5. For background art only, add a second ScreenGui with ScreenInsets = None, Active = false on its objects [S2].
6. Test in Device Simulator on one small phone, one notched phone, one tablet, plus 1080p and a TV profile [S32].
Pitfalls: ScreenInsets = None hides buttons under notches; IgnoreGuiInset true or None misplaces UI under the top bar; setting ResetOnSpawn true wipes HUD state each respawn (only direct StarterGui children persist with false) [S10].

### 2. Mobile-first HUD with currency and action buttons
When to use: simulators, tycoons, obbies, any game with a persistent HUD.
Steps:
1. Inside "Safe" create three zones: TopLeft (currency stack), Right-middle (menu buttons: Shop, Inventory, Settings), BottomCenter (hotbar/ability row if needed). Keep both bottom corners empty on touch [S9].
2. Currency pill: Frame, Size (0.2,0,0.06,0), UISizeConstraint MinSize (140,36) MaxSize (260,56); child ImageLabel icon (UIAspectRatioConstraint 1) and TextLabel (AutomaticSize X, TextXAlignment Left); UIListLayout Horizontal Padding (0,6); UICorner 0.5 scale pill; UIStroke 2 px [S12][S35].
3. Menu buttons: ImageButton 56 x 56 px (UISizeConstraint Min 48, Max 72), UIListLayout Vertical Padding (0,8), anchored right-middle with Position (1,-16,0.5,0) and AnchorPoint (1,0.5) [S34].
4. Wire Activated on each button; play a click Sound and a UIScale press tween.
5. Disable default CoreGui you replace (Health, Backpack) with StarterGui:SetCoreGuiEnabled in a client script [S35][S44].
Pitfalls: Roblox's top-left controls overlap anything placed at (0,0); CoreUISafeInsets prevents it. Do not show every stat at once; reduce to 2-3 essentials and put the rest behind a menu (Roblox: show only vital info during active play) [S9].

### 3. Top-bar-safe widget (TopbarSafeInsets)
When to use: a compact widget (currency, timer, mini-map toggle) that sits in the top bar row.
Steps:
1. Create ScreenGui "TopRow", ScreenInsets = TopbarSafeInsets. Its area equals the free strip right of the experience controls [S2][S4].
2. Child Frame Size (1,0,1,0) with UIListLayout Horizontal, HorizontalAlignment Right, Padding (0,6).
3. Items 36-44 px high; use UIFlexItem or AutomaticSize X; hide the least important item with a StyleQuery @ViewportDisplaySizeSmall if width runs out.
4. For a manual alternative, read GuiService.TopbarInset and update on GetPropertyChangedSignal("TopbarInset") [S1][S64].
5. Console fallback: if the strip reports zero height (see the Dec 2025 bug), detect AbsoluteSize.Y < 1 and move the widget into the CoreUISafeInsets HUD [S67].
Pitfalls: on portrait phones the controls can fill the width and your strip can be nearly empty [S61]; TopbarInset's Rect is in full-screen pixel space (use it in an IgnoreGuiInset ScreenGui, as the docs sample does [S94]); a Studio regression on 2025-11-05 was fixed same day [S66].

### 4. Modal panel with tabs and standard close
When to use: shop, inventory, settings, quests.
Steps:
1. ScreenGui "Modals" DisplayOrder 10, ScreenInsets CoreUISafeInsets. A dimmer Frame (black, BackgroundTransparency 0.5, Active = true, InputSink = All) covers the area to block clicks behind [S19].
2. Panel: AnchorPoint (0.5,0.5), Position (0.5,0,0.5,0), Size (0.8,0,0.8,0), UIAspectRatioConstraint 1.6-2.5, UISizeConstraint Max (800,520) Min (350,250), UICorner, UIStroke, optional UIShadow [S34][S36].
3. Close button: square, red with white X, top-right at AnchorPoint (1,0) Position (1,-10,0,10), 44 px minimum [S27][S34].
4. Tabs: a UIListLayout (Horizontal, HorizontalFlex Fill) so tabs share width equally [S11]; pages as sibling Frames inside a UIPageLayout (Animated true, TweenTime 0.2) or toggled Visible [S57].
5. Open: UIScale 0.9 to 1 plus GroupTransparency 1 to 0 on a CanvasGroup in 0.25 s; close the reverse; skip the motion when ReducedMotionEnabled [S42][S33].
6. Gamepad: set SelectedObject to the first button when opening; clear on close; B closes [S31].
Pitfalls: CanvasGroup uses texture memory and needs Sibling ZIndexBehavior [S42]; hide via Enabled on the ScreenGui, not by tweening 100 children.

### 5. Shop item grid in a ScrollingFrame
When to use: item shops, pet/egg lists, cosmetics.
Steps:
1. ScrollingFrame: Size (1,0,1,0), BackgroundTransparency 1, AutomaticCanvasSize = Y, CanvasSize (0,0,0,0), ScrollingDirection = Y, ScrollBarThickness 8, ElasticBehavior default (touch bounce) [S45][S14].
2. Child UIGridLayout: CellSize {0,140},{0,180} for phone, CellPadding {0,10},{0,10}, HorizontalAlignment Center, SortOrder LayoutOrder [S46]. For adaptive columns without scripts use a UIListLayout with Wraps = true, FillDirection Horizontal, HorizontalAlignment Center and fixed-size cards [S47].
3. Card template: Frame with UICorner, UIStroke; ImageLabel on top; TextLabel name (AutomaticSize Y, TextWrapped); price Button (TextButton or ImageButton) at bottom, 44 px high minimum; "featured" cards use a larger cell via a separate row.
4. Add UIPadding to the ScrollingFrame so card shadows are not clipped.
5. Price states: affordable (green), unaffordable (red text), owned (grey, check icon) [S27].
6. For large catalogues, build rows lazily or recycle (third-party guidance, performance) [S85].
Pitfalls: UIGridLayout fixes cell size and overrides child Size [S13]; a UIAspectRatioConstraint on a card is ignored by the grid; CanvasSize must stay (0,0,0,0) when AutomaticCanvasSize is on.

### 6. Hotbar / inventory slots (bottom-centre)
When to use: tool-based games with a custom backpack.
Steps:
1. Disable Roblox backpack: StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Backpack, false) [S44].
2. Row Frame at BottomCenter: AnchorPoint (0.5,1), Position (0.5,0,1,-12), UIListLayout Horizontal Padding (0,6); slots ImageButton 56 x 56 px with UIAspectRatioConstraint 1 and a number label for keyboard keys 1-9.
3. Keep slots away from the jump button: on touch, anchor the row at BottomCenter and limit to about 5-6 slots visible; scroll or page the rest.
4. Equip with Humanoid:EquipTool; mark the equipped slot with UIStroke.Color change plus a 1.1 UIScale.
5. Gamepad: Selectable on slots, NextSelectionLeft/Right between neighbors.
Pitfalls: bottom-right is the jump zone on touch [S9]; the default backpack hides when empty and re-appears if you forget to disable it.

### 7. Animated currency counter and "+N" popups
When to use: any reward feedback.
Steps:
1. Keep a NumberValue "Shown" parented to the HUD; tween Shown.Value toward the real value with TweenInfo.new(0.5, Quad, Out) and set the label text from Shown.Changed using a short formatter [S54].
2. On gain create a TextLabel "+N" at the source (screen position from WorldToViewportPoint) and tween Position up by 40 px and TextTransparency to 1 in 0.8 s, then Destroy.
3. Pulse the currency icon via UIScale 1 to 1.15 and back in 0.15 s.
4. If ReducedMotionEnabled, set the value instantly and skip the popup movement [S33].
Pitfalls: tweening the same property twice cancels the first tween (cancel and retarget deliberately) [S54]; WorldToViewportPoint returns a point that includes the top bar inset assumptions (see Open questions); format large numbers.

### 8. Toast notification stack
When to use: reward, error, quest, invite messages.
Steps:
1. ScreenGui "Toasts" (CoreUISafeInsets, DisplayOrder 20). Container Frame at top-centre or bottom-left of the safe area, UIListLayout Vertical, VerticalAlignment Top/Bottom, Padding (0,6), SortOrder LayoutOrder.
2. Toast: CanvasGroup (so GroupTransparency can fade it), AutomaticSize Y, width 0.3 scale with UISizeConstraint Max (360, inf), UICorner, UIStroke, UIPadding 10 px, TextLabel with RichText for highlights [S23][S42].
3. Show: GroupTransparency 1 to 0 in 0.3 s; hold 3 s; fade out 0.3 s; Destroy. Cap at 4 live toasts, dropping the oldest.
4. Keep Roblox's SendNotification for system-like messages only [S44].
Pitfalls: many CanvasGroups cost memory; reuse or cap [S42]; filter any user-provided text [S55].

### 9. Button states and press feedback
When to use: all buttons.
Steps:
1. Button (TextButton/ImageButton): AutoButtonColor = false if you animate yourself; add a UIScale.
2. Hover (desktop only): MouseEnter/MouseLeave tween BackgroundColor3 slightly lighter [S19].
3. Press: InputBegan or GuiState to Press, UIScale to 0.95 in 0.08 s; release back; Activated fires the action [S20].
4. Disabled state: Interactable = false and desaturate; show a lock icon [S19][S27].
5. Optional haptic: HapticEffect of a UI click type on mobile/gamepad [S50].
Pitfalls: hover does not exist on touch; do not hide information behind hover. Use SecondaryActivated for long-press alternates [S20].

### 10. Gamepad and console navigation
When to use: any game shipping to console or supporting controllers.
Steps:
1. Every control: Selectable = true. Group related controls in a Frame with SelectionGroup (third-party guide: use it to trap focus in modals) [S85].
2. On opening a screen: GuiService.SelectedObject = defaultButton (or GuiService:Select(frame)); on close: SelectedObject = nil [S1][S85].
3. Irregular layouts: set NextSelectionUp/Down/Left/Right explicitly [S19].
4. Style: set SelectionImageObject to a UIStroke-ed Frame for a clear focus ring [S19].
5. Show glyphs with InputActionLabel bound to the InputAction instead of hard-coded key names [S51].
6. Test with the Controller Emulator in Studio and the Device Simulator [S31][S32].
Pitfalls: TopbarSafeInsets console bug (Dec 2025) [S67]; AutoSelectGuiEnabled changes how the Select button picks a first object [S1]; keep ButtonB = back [S31].

### 11. Accessibility pack (text size, transparency, reduced motion)
When to use: ship with every UI; cheap and increasingly expected.
Steps:
1. Text: build text objects with AutomaticSize Y + TextWrapped; avoid TextScaled; set UITextSizeConstraint MaxTextSize as a ceiling for headers where overflow would break layout [S33][S77].
2. Listen: GuiService:GetPropertyChangedSignal("PreferredTextSize") if you need custom reflow [S1].
3. Transparency: tag glass panels with CollectionService tag "TransparentBack"; on start and on PreferredTransparency change, set BackgroundTransparency = base * GuiService.PreferredTransparency [S33].
4. Motion: central helper dur(t) returns 0 when ReducedMotionEnabled [S33].
5. Colour: pair status colours with icons/shapes; check contrast of text on fills at about 4.5:1 [S33][S86].
6. Audio: separate sliders for music, SFX, voice [S33].
Pitfalls: RichText + PreferredTextSize interactions are a known DevForum complaint (text objects with RichText but not TextScaled get scaled) [S69].

### 12. UI theme with StyleSheet, tokens and StyleQuery
When to use: games with many screens, or to switch layouts by device size without scripts.
Steps:
1. In Studio, open the Style Editor, create a StyleSheet; define tokens as attributes (for example PrimaryColor, Radius, Pad) [S24].
2. Add StyleRules: selector ".ButtonPrimary" sets BackgroundColor3 = $PrimaryColor; selector "Frame.RoundedCorner20::UICorner" style pattern creates a UICorner [S25].
3. Tag objects via CollectionService tags (ButtonPrimary, Panel).
4. Link with a StyleLink from each ScreenGui [S24].
5. Responsive: use built-in queries such as @ViewportDisplaySizeSmall for phone-only overrides (smaller padding, larger touch targets) and @ReducedMotionEnabledTrue for motion [S25][S52].
6. Hover/press states via :Hover and :Press selectors; add transitions with TweenInfo [S25].
Pitfalls: only one StyleSheet applies per tree (use StyleDerive for layering) [S24]; styled properties show a warning icon in Properties and overrides appear bold [S24]; the class/property list is not complete [S26].

### 13. Custom proximity prompt (interact UI)
When to use: doors, shops, NPCs, pickups, instead of permanent buttons.
Steps:
1. Add ProximityPrompt to the Part: ActionText, ObjectText, HoldDuration (0 for instant, 0.5-1.5 s for deliberate), MaxActivationDistance, RequiresLineOfSight, ClickablePrompt = true for touch [S53].
2. Keep default KeyboardKeyCode E and GamepadKeyCode ButtonX unless it clashes [S53].
3. For a custom look set Style = Custom and build the UI listening to PromptShown/PromptHidden on ProximityPromptService [S53].
Pitfalls: prompt button sizes must still be touch-sized when ClickablePrompt is true; do not rely on prompts for continuous actions.

### 14. In-world UI (BillboardGui health bars and SurfaceGui screens)
When to use: nameplates, enemy health bars, diegetic signs.
Steps:
1. BillboardGui parented to a head Attachment: Size scale (4,0,0.6,0) studs, StudsOffset (0,2.5,0), MaxDistance 60-100, AlwaysOnTop false [S58].
2. Inner bar: Frame with UICorner 0.5; fill Frame Size scaled to health fraction, tweened [S35].
3. SurfaceGui for screens: Face set, scale sizing, UIAspectRatioConstraint; remember buttons only work when the SurfaceGui is under PlayerGui (set Adornee) [S58].
Pitfalls: many always-on-top billboards harm readability and performance; use MaxDistance.

### 15. FTUE hints and first-minutes UI
When to use: the first 2-5 minutes of any new game.
Steps:
1. One objective line at the top (Frame with UICorner, 18-22 px text) updated per step; one arrow or Highlight pointing at the target; no walls of text [S28][S29].
2. Use low first thresholds and starter currency so the first purchase happens within about a minute (judgement; the Roblox guide says low early thresholds and starter items) [S29].
3. Show short, mid and long goals as a small checklist [S29].
4. Instrument each step as a funnel event to find drop-off [S29].
Pitfalls: long tutorials are abandoned [S28].

### 16. Device test checklist (before shipping UI)
When to use: after any UI change.
Steps: run Device Simulator with a small phone (touch), a notched phone, a tablet, and a console/TV profile; check (1) nothing under top bar or notch, (2) every target >= 44 px rendered, (3) no UI in thumbstick or jump zones, (4) text still fits at Largest preferred text size (change in Roblox settings or emulate by setting font sizes +30%, judgement), (5) gamepad can reach and activate every control, (6) reduced motion path works [S32][S33][S31].

## Luau reference snippets
All APIs below are in the cited docs. Client LocalScripts only.

```lua
--!strict
local Players = game:GetService("Players")
local GuiService = game:GetService("GuiService")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local StarterGui = game:GetService("StarterGui")

local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")

-- 1. Safe ScreenGui skeleton
local hud = Instance.new("ScreenGui")
hud.Name = "Hud"
hud.ResetOnSpawn = false
hud.ScreenInsets = Enum.ScreenInsets.CoreUISafeInsets  -- default, set explicitly
hud.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
hud.DisplayOrder = 1
hud.Parent = playerGui

local safe = Instance.new("Frame")
safe.Name = "Safe"
safe.BackgroundTransparency = 1
safe.Size = UDim2.fromScale(1, 1)
safe.Parent = hud
```

```lua
-- 2. Responsive centered panel (Scale + AnchorPoint + constraints)
local function makePanel(parent: Instance): Frame
	local panel = Instance.new("Frame")
	panel.AnchorPoint = Vector2.new(0.5, 0.5)
	panel.Position = UDim2.fromScale(0.5, 0.5)
	panel.Size = UDim2.fromScale(0.8, 0.8)
	panel.BackgroundColor3 = Color3.fromRGB(30, 30, 60)
	panel.BackgroundTransparency = 0.1

	local ratio = Instance.new("UIAspectRatioConstraint")
	ratio.AspectRatio = 1.8
	ratio.Parent = panel

	local limit = Instance.new("UISizeConstraint")
	limit.MinSize = Vector2.new(350, 200)
	limit.MaxSize = Vector2.new(800, 520)
	limit.Parent = panel

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 12)
	corner.Parent = panel

	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 2
	stroke.Color = Color3.fromRGB(255, 255, 255)
	stroke.Transparency = 0.7
	stroke.Parent = panel

	panel.Parent = parent
	return panel
end
```

```lua
-- 3. Top-bar-safe strip: a ScreenGui whose area IS the free top bar space
local topRow = Instance.new("ScreenGui")
topRow.Name = "TopRow"
topRow.ScreenInsets = Enum.ScreenInsets.TopbarSafeInsets
topRow.ResetOnSpawn = false
topRow.Parent = playerGui

local row = Instance.new("Frame")
row.BackgroundTransparency = 1
row.Size = UDim2.fromScale(1, 1)
row.Parent = topRow
local list = Instance.new("UIListLayout")
list.FillDirection = Enum.FillDirection.Horizontal
list.HorizontalAlignment = Enum.HorizontalAlignment.Right
list.VerticalAlignment = Enum.VerticalAlignment.Center
list.Padding = UDim.new(0, 6)
list.Parent = row

-- Optional: react when the controls change width
GuiService:GetPropertyChangedSignal("TopbarInset"):Connect(function()
	local r = GuiService.TopbarInset -- Rect: r.Min, r.Width, r.Height
	print("free top bar width", r.Width)
end)
```

```lua
-- 4. Scrolling shop grid
local scroll = Instance.new("ScrollingFrame")
scroll.Size = UDim2.fromScale(1, 1)
scroll.BackgroundTransparency = 1
scroll.CanvasSize = UDim2.new()
scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
scroll.ScrollingDirection = Enum.ScrollingDirection.Y
scroll.ScrollBarThickness = 8

local grid = Instance.new("UIGridLayout")
grid.CellSize = UDim2.fromOffset(140, 180)
grid.CellPadding = UDim2.fromOffset(10, 10)
grid.HorizontalAlignment = Enum.HorizontalAlignment.Center
grid.SortOrder = Enum.SortOrder.LayoutOrder
grid.Parent = scroll
```

```lua
-- 5. Reduced motion, preferred transparency, preferred text size
local function dur(seconds: number): number
	return if GuiService.ReducedMotionEnabled then 0 else seconds
end

local function applyGlass(frame: GuiObject, baseTransparency: number)
	frame.BackgroundTransparency = baseTransparency * GuiService.PreferredTransparency
end

GuiService:GetPropertyChangedSignal("PreferredTextSize"):Connect(function()
	print("text size preference now", GuiService.PreferredTextSize) -- Medium/Large/Larger/Largest
end)

-- Press feedback with UIScale
local function attachPress(button: GuiButton)
	local scale = Instance.new("UIScale")
	scale.Parent = button
	local function to(v: number)
		TweenService:Create(scale, TweenInfo.new(dur(0.08), Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Scale = v }):Play()
	end
	button.InputBegan:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
			to(0.95)
		end
	end)
	button.InputEnded:Connect(function() to(1) end)
end
```

```lua
-- 6. Gamepad focus when a screen opens
local function openScreen(defaultButton: GuiObject)
	defaultButton.Selectable = true
	if UserInputService.GamepadEnabled then
		GuiService.SelectedObject = defaultButton
	end
end
local function closeScreen()
	GuiService.SelectedObject = nil
end

-- Branch on last input, not on device
UserInputService.LastInputTypeChanged:Connect(function(t: Enum.UserInputType)
	local touch = (t == Enum.UserInputType.Touch)
	print("touch layout?", touch)
end)
```

```lua
-- 7. Viewport size bucket
local function onSize()
	print(GuiService.ViewportDisplaySize) -- Small / Medium / Large
end
GuiService:GetPropertyChangedSignal("ViewportDisplaySize"):Connect(onSize)
onSize()

-- Hide default UI you replace
StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Backpack, false)
StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Health, false)
```

```lua
-- 8. Animated counter via NumberValue
local shown = Instance.new("NumberValue")
shown.Parent = hud
local label: TextLabel = safe:WaitForChild("CoinLabel") :: TextLabel
local function format(n: number): string
	if n >= 1e9 then return string.format("%.1fB", n / 1e9)
	elseif n >= 1e6 then return string.format("%.1fM", n / 1e6)
	elseif n >= 1e3 then return string.format("%.1fK", n / 1e3) end
	return tostring(math.floor(n))
end
shown.Changed:Connect(function(v) label.Text = format(v) end)
local function setCoins(target: number)
	TweenService:Create(shown, TweenInfo.new(dur(0.5), Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Value = target }):Play()
end
```

## Open questions / unverified
Still open after the 2026-10-04 gap pass (8):
- Exact current top bar height in pixels: only community figures (44 or 48, March 2025 thread) and a 36 from 2020; Roblox never states one number. Use the APIs [S63][S65].
- Whether TopbarSafeInsets on console emulation is fixed (staff said on 2025-11-21 they believe so; a new report on 2025-12-02 says it is not), and whether console/VR have received the updated experience controls (announced as "future" in Oct 2024) [S61][S67][S95].
- A verified 2026 device split: the FY2025 10-K (83/14/3) is the latest; the 2026 shareholder letters give none [S89][S98]. The 60%/70%/20% third-party variants stay unsourced [S83][S84][S86][S87].
- The interaction of ScreenInsets and IgnoreGuiInset when both are set was not spelled out in the pages I read; set ScreenInsets explicitly [S3][S60].
- StyleSheet/StyleRule/StyleLink scripting APIs (creating them from Luau): I only verified the Studio-level model and selector syntax, so no Luau examples are given [S24][S25].
- UICorner reference page still says per-corner radii are beta though the DevForum recap says GA (2026-06-26); UIShadow docs verified, release by recap [S37][S76].
- Specific HUD/shop/inventory layouts of top 2025-2026 hits (Grow a Garden, Steal a Brainrot, Fisch, etc.): no developer post, talk or analysis article with real layouts was found; only marketplace UI-pack listings and a 90-page paid teardown whose public page does not say it covers UI (not read) [S99]. A follow-up should capture screenshots from the live games.
- Touch-target numbers: Apple 44 pt and Android 48 dp are repeated by third-party guides but I did not fetch Apple HIG or Material pages [S85][S87].

Resolved in the gap pass (moved into Key facts): FY2024 and FY2025 device split (80/17/3 and 83/14/3, from the 10-K charts); TopbarInset coordinate space (full-screen pixels, per the official sample); Enum.PreferredInput item names; the full haptics list (HapticEffectType, VibrationMotor, HapticService methods); ImageLabel.ResampleMode (Default/Pixelated); per-object text-size opt-out (none exists); `TextBox.ShowNativeInput` and `UIPageLayout` JumpTo, JumpToIndex, Next, Previous exist [S97]; Q2 2026 company numbers (checked in the letter PDF).
Date flags: S63 (2020), S60 (2022), S72 (2023) are older than 2024 and may be stale; S70 (Mar 2024) is still current.

## Sources
[S1] GuiService class reference (creator-docs YAML, main branch; fetched 2026-10-04), https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/GuiService.yaml (also create.roblox.com/docs/reference/engine/classes/GuiService)
[S2] Enum.ScreenInsets, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/enums/ScreenInsets.yaml
[S3] ScreenGui class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/ScreenGui.yaml
[S4] Screen insets include (docs component), https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/includes/ui/screen-insets.md
[S5] Default UI / core GUI include, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/includes/ui/default-ui.md
[S6] Enum.SafeAreaCompatibility, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/enums/SafeAreaCompatibility.yaml
[S7] Enum.PreferredTextSize, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/enums/PreferredTextSize.yaml
[S8] Enum.DisplaySize, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/enums/DisplaySize.yaml
[S9] Position and size UI objects, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/position-and-size.md
[S10] On-screen UI containers, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/on-screen-containers.md
[S11] List and flex layouts, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/list-flex-layouts.md
[S12] UI size modifiers and constraints, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/size-modifiers.md
[S13] Grid and table layouts, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/grid-table-layouts.md
[S14] Scrolling frames, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/scrolling-frames.md
[S15] Text and image labels, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/labels.md
[S16] TextLabel class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/TextLabel.yaml
[S17] Enum.Font (legacy), https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/enums/Font.yaml
[S18] Font datatype, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/datatypes/Font.yaml
[S19] GuiObject class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/GuiObject.yaml
[S20] Text and image buttons, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/buttons.md
[S21] UI animation (tweens), Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/animation.md
[S22] UI 9-slice, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/9-slice.md
[S23] Rich text markup, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/rich-text.md
[S24] UI styling overview (StyleSheet, StyleRule, StyleLink, tokens), https://create.roblox.com/docs/ui/styling
[S25] Styling vs CSS, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/styling/css-comparisons.md
[S26] Styling compatibility list, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/styling/compatibility.md
[S27] UI and UX design (production/game-design), Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/production/game-design/ui-ux-design.md
[S28] Design for Roblox, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/production/game-design/design-for-roblox.md
[S29] Onboarding, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/production/game-design/onboarding.md
[S30] Mobile input, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/input/mobile.md
[S31] Gamepad input, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/input/gamepad.md
[S32] Testing modes (Device Simulator, Controller Emulator), Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/studio/testing-modes.md
[S33] Accessibility for publishing, Roblox Creator Docs, https://create.roblox.com/docs/en-us/production/publishing/accessibility.md
[S34] Create interactive UI tutorial, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/tutorials/use-case-tutorials/ui/interactive-ui.md
[S35] Create HUD meters tutorial, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/tutorials/use-case-tutorials/ui/create-hud-meters.md
[S36] UIShadow class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/UIShadow.yaml
[S37] UICorner class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/UICorner.yaml
[S38] UIStroke class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/UIStroke.yaml
[S39] UIFlexItem class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/UIFlexItem.yaml
[S40] UIAspectRatioConstraint class reference and Enum.DominantAxis, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/UIAspectRatioConstraint.yaml ; .../enums/DominantAxis.yaml
[S41] UITextSizeConstraint class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/UITextSizeConstraint.yaml
[S42] CanvasGroup class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/CanvasGroup.yaml
[S43] UIScale class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/UIScale.yaml
[S44] StarterGui class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/StarterGui.yaml
[S45] ScrollingFrame class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/ScrollingFrame.yaml
[S46] UIGridLayout class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/UIGridLayout.yaml
[S47] UIListLayout class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/UIListLayout.yaml
[S48] UIDragDetector class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/UIDragDetector.yaml
[S49] UserInputService class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/UserInputService.yaml
[S50] HapticEffect class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/HapticEffect.yaml
[S51] InputActionLabel class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/InputActionLabel.yaml
[S52] StyleQuery class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/StyleQuery.yaml
[S53] ProximityPrompt class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/ProximityPrompt.yaml
[S54] TweenService class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/TweenService.yaml
[S55] Text filtering, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/text-filtering.md
[S56] Text input fields, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/text-input.md
[S57] Page layouts, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/page-layouts.md
[S58] In-experience UI containers (SurfaceGui, BillboardGui), Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/ui/in-experience-containers.md
[S59] Roblox user base (production), Roblox Creator Docs (no device percentages; dated Q2 2022 chart), https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/production/roblox-user-base.md
[S60] Notched Screen Support - FULL RELEASE, stadium_parkour (Roblox staff), DevForum, 2022-12-08 (older than 2024), https://devforum.roblox.com/t/notched-screen-support-full-release/2074324
[S61] Updated Experience Controls Now Live, workbloxing (Roblox staff), DevForum, 2024-10-15, https://devforum.roblox.com/t/updated-experience-controls-now-live/3215981
[S62] Updated In Experience Controls on Roblox, workbloxing, DevForum, 2024-06-18, https://devforum.roblox.com/t/updated-in-experience-controls-on-roblox/3028958
[S63] New In-Game Topbar, TheGamer101 (Roblox staff), DevForum, 2020-03-13 (stale), https://devforum.roblox.com/t/new-in-game-topbar/480226
[S64] Top bar Menu Issues, DevForum, 2024-07-09, https://devforum.roblox.com/t/top-bar-menu-issues/3060582
[S65] Mouse Position to Pixel position is inaccurate, DevForum, 2025-02-25 to 2025-03-11, https://devforum.roblox.com/t/mouse-position-to-pixel-position-is-inaccurate/3507451
[S66] ScreenGUI.ScreenInsets = TopbarInsets regression, Noobot9k, DevForum, 2025-11-05 (staff fix same day, QuirkySquid), https://devforum.roblox.com/t/screenguiscreeninsets-topbarinsets-regression/4047230
[S67] ScreenGui.ScreenInsets TopbarSafeInsets is incorrect on Consoles, HooferBevelops, DevForum, 2025-12-02, https://devforum.roblox.com/t/screenguiscreeninsets-topbarsafeinsets-is-incorrect-on-consoles/4111410
[S68] Feedback on "ScreenInsets" (docs issue), Bomby_zewo / IgnisRBX, DevForum, 2025-12-26 and 2026-01-08, https://devforum.roblox.com/t/feedback-on-screeninsets/4186295
[S69] Preferred Text Scaling needs to be Reverted..., index_self, DevForum, 2025-08-31 (staff reply 2025-09-02), https://devforum.roblox.com/t/preferred-text-scaling-needs-to-be-reverted-abrupt-release-with-no-concerns-addressed-are-disruptive/3911199
[S70] Introducing Builder Font + Deprecating Gotham and Arial, vamorafa (Roblox), DevForum, 2024-03-07, https://devforum.roblox.com/t/2868222
[S71] Allow TextSize above 100, XAXA, DevForum, 2025-09-26 to 2025-10-02, https://devforum.roblox.com/t/allow-textsize-above-100/3959480
[S72] The Correct Way to Design Mobile Buttons, Micamaster100, DevForum community tutorial, 2023-07-29 (older than 2024), https://devforum.roblox.com/t/the-correct-way-to-design-mobile-buttons/2494558
[S73] Creator Roadmap 2026: Fall Update, Roblox, DevForum, 2026-09-18, https://devforum.roblox.com/t/creator-roadmap-2026-fall-update/4880208
[S74] Creator Roadmap 2026: Spring Update, Roblox, DevForum, 2026-05-08, https://devforum.roblox.com/t/creator-roadmap-2026-spring-update/4625473
[S75] RDC26: What We Announced, NickT, DevForum, 2026-09-11, https://devforum.roblox.com/t/rdc26-what-we-announced/4865880
[S76] Weekly Recap: June 22-26, 2026 (UIShadow and UICorner full release), frecklesnspectacles, DevForum, 2026-06-26, https://devforum.roblox.com/t/weekly-recap-june-22-26-2026/4704424
[S77] Roblox introduces global text size accessibility setting, Can I Play That?, 2025-08-27, https://caniplaythat.com/2025/08/27/roblox-introduces-global-text-size-accessibility-setting/
[S78] Roblox Corp Form 10-K FY2025 (127M average DAU, 123.9B hours), SEC, https://www.sec.gov/Archives/edgar/data/1315098/000131509826000024/rblx-20251231.htm
[S79] Roblox Corp Form 10-K FY2024 (DAU chart as image; 82.9M DAU), SEC, https://www.sec.gov/Archives/edgar/data/1315098/000131509825000033/rblx-20241231.htm
[S80] 80% of Roblox users are on mobile, contributing 46% of Robux revenue, PocketGamer.biz, 2025-04-23, http://www.pocketgamer.biz/80-of-roblox-users-are-on-mobile-contributing-46-of-robux-revenue/
[S81] Roblox has a surprising amount of players on mobile platforms, Gameranx, 2025-04-23, https://gameranx.com/updates/id/536101/article/roblox-has-a-surprising-amount-of-players-on-mobile-platforms/
[S82] Roblox Q2 2026 earnings release/letter (8-K ex. 99.1), SEC, 2026, https://www.sec.gov/Archives/edgar/data/0001315098/000162828026051059/ex991-robloxq22026earnin.htm
[S83] Mobile vs. Desktop on Roblox: Who's Playing What in 2026, RoWatcher News (third-party, unattributed numbers), https://rowatcher.com/news/mobile-vs-desktop-on-roblox-who-s-playing-what-in-2026
[S84] Mobile-first design / Roblox engagement, Tu Dang, ROLearn (third-party), 2026-02-05, https://rolearn.dev/insights/mobile-first-design-roblox-engagement
[S85] Roblox UI Systems: Building Menus and HUDs That Scale Across Phone, Console, and PC, Simplified Media (third-party), 2026-07-13, https://simplified.media/guides/roblox-ui-systems
[S86] UI/UX Design for Roblox: The Complete Guide, SpawnBlox Dev Hub (third-party, 2026), https://spawnblox.com/articles/ui-ux-design.html
[S87] How to Fix Roblox UI Scaling on Mobile, KitsBlox (third-party), 2026-03-15, https://kitsblox.com/blog/fix-roblox-ui-scaling-mobile
[S88] GuiService reference pages on create.roblox.com (GetGuiInset, TopbarInset, PreferredTextSize), fetched 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/GuiService/GetGuiInset
Added in the gap pass (2026-10-04):
[S89] Roblox FY2025 Form 10-K, "Breakdown of Our Users" pie charts (image rblx-20251231_g2.jpg: Platform = Mobile 83%, Desktop 14%, Console 3%; Gender, Geography also shown), SEC, https://www.sec.gov/Archives/edgar/data/1315098/000131509826000024/rblx-20251231.htm
[S90] Roblox FY2024 Form 10-K, same chart (image rblx-20241231_g2.jpg: Mobile 80%, Desktop 17%, Console 3%), SEC, https://www.sec.gov/Archives/edgar/data/1315098/000131509825000033/rblx-20241231.htm
[S91] Enum.PreferredInput, creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/enums/PreferredInput.yaml
[S92] HapticEffect, HapticService, Enum.HapticEffectType and Enum.VibrationMotor references, creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/enums/HapticEffectType.yaml (and classes/HapticEffect.yaml, classes/HapticService.yaml, enums/VibrationMotor.yaml)
[S93] ImageLabel.ResampleMode and Enum.ResamplerMode, creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/enums/ResamplerMode.yaml (and classes/ImageLabel.yaml)
[S94] GuiService.TopbarInset code sample and GetInsetArea, https://create.roblox.com/docs/reference/engine/classes/GuiService ; Enum.ScreenInsets (relative to fullscreen area), https://robloxapi.github.io/ref-temp/enum/ScreenInsets.html
[S95] "TopbarSafeInsets is wrong on Xbox and PS4 with new experience controls", mvyasu, DevForum, 2024-02-22 (staff reply 2025-11-21), https://devforum.roblox.com/t/topbarsafeinsets-is-wrong-on-xbox-and-ps4-with-new-experience-controls/2848042
[S96] "New preferred text size setting makes it impossible to have text objects using RichText without TextScaled enabled that aren't affected by the setting", vaoo, DevForum, Sept 2025, https://devforum.roblox.com/t/3914959
[S97] Roblox API dump, Roblox-Client-Tracker, version 0.741.19.7411056 (member checks: no per-object text-size property; TextBox.ShowNativeInput; UIPageLayout JumpTo/JumpToIndex/Next/Previous; PreferredInput), https://raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker/roblox/API-Dump.json
[S98] Roblox shareholder letters Q4 2025, Q1 2026 and Q2 2026 (no device split; Q2 2026: 123M DAU, 29B hours, 27M MUPs), https://s27.q4cdn.com/984876518/files/doc_financials/2026/q2/Roblox-Q2-2026-Earnings-Shareholder-Letter.pdf (also .../2026/q1/Q1-2026-Earnings-Shareholder-Letter.pdf and .../2025/q4/Q4-2025-Shareholder-Letter.pdf)
[S99] Low-trust UI-style evidence: BuiltByBit UI-pack listings (Grow a UI Pack, Premium UI Pack Brainrot) and a 2026 UI-trends article seen only as search-result snippets, not opened; and "Grow a garden ui example", ProbablyGavin, DevForum, 2025-06-20, https://devforum.roblox.com/t/grow-a-garden-ui-example/3764006
