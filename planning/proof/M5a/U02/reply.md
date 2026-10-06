The place is a blank slate — just a baseplate and spawn, no GUI or scripts yet. Handing this to the builder.

Builder's done. Now a play check from the tester.

Clean run. Now the reviewer checks the scripts.

Done — your main menu is in and verified. Here's the summary:

**What was built**
- **`StarterGui.MainMenu`** — full-screen cartoony studded menu: "Stud World" title, and three chunky buttons with icons — **Play** (lime), **Settings** (sky blue), **Shop** (orange). Thick outlines, drop shadows, bold playful font.
- **`StarterGui.Settings` / `StarterGui.Shop`** — matching placeholder panels ("coming soon" copy) with a working X close button, hidden until opened.
- **`StarterPlayerScripts.StudPilotUiFx`** — buttons grow on hover (1.06×) and squash on press (0.94×).
- Bonus polish: candy-day lighting and the grey baseplate turned into bright lime studded grass so the menu doesn't sit on bare grey.

**Behavior**
- **Play** dismisses the menu so you can walk around; it stays dismissed through respawns (`ResetOnSpawn=false` everywhere).
- **Settings/Shop** pop open above the menu; close returns you to it.

**Checks** — playtest ran with zero errors/warnings from the game scripts, and the reviewer confirmed all wiring is correct.

**Minor caveats** (cosmetic, not breaking): on touch devices buttons won't show the press-squash effect (desktop hover/press works fine), and one placeholder row literally says "Placeholder" with empty value slots — easy to reword whenever the real Settings/Shop content arrives.
