# Apple — what "finished" means

The owner wrote this on 2026-09-20. It is the definition of done for the whole product, and it is
written as CLAUSES so each one can be measured against the deployed product rather than agreed with.

The rule for every clause below is the repository's own: **a failure to observe must not render as an
observation.** A clause is PASS only when somebody has watched the deployed product do it. "The code
looks right" is not a pass. A clause nobody could measure is UNMEASURED, never PASS.

---

## A. The first five minutes for a stranger

| id | clause | how it is measured |
|---|---|---|
| A1 | Lands on the site and within three seconds knows what this is and why it beats writing code alone | first screen at 1280 and 375 carries a one-line answer above the fold |
| A2 | Signs up with an email. No card, no questionnaire | the sign-up path asks for email only |
| A3 | Sees a composer with an example sentence in it | the empty composer shows a real example, not a bare placeholder |
| A4 | Types "an obby with lava and 3 stages" and it is understood | a short English prompt starts a build. HEBREW WAS REMOVED on 2026-09-20: a Hebrew prompt was measured losing a word silently (לבה -> לב, lava -> heart) and returning an empty run intent, so the product no longer offers it |
| A5 | Watches the model think — real stages, not a spinner: what it understood, the plan, what it is building now | the thinking panel names understood / plan / current action |
| A6 | Gets a game, opens it in Studio, it works | a run produces a place a person can open |
| A7 | Never gets stuck. Never reads documentation | no dead end in the first-run path |

## B. The chat

| id | clause |
|---|---|
| B1 | The composer takes English, including a short careless sentence. Text a person types in any script still renders the right way round — that is correctness, not a claim of support |
| B2 | Plan (looks and proposes) or Agent (builds) is chosen by the person |
| B3 | Apple or Apple MAX is chosen by the person, and MAX actually thinks harder |
| B4 | An image can be attached with "make it like this" |
| B5 | The thinking panel says which tool ran, on what, how long, what came back |
| B6 | A step that failed says it failed |
| B7 | Stop mid-run keeps what was built |
| B8 | Ctrl+Z takes back one change; a checkpoint takes back a whole run |
| B9 | Every run shows what it cost in credits, while it runs |
| B10 | A run that failed does not charge twice |

## C. What the model can do

Reads and writes scripts · creates, moves and deletes objects · runs Luau and checks the result ·
sets lighting and weather · adds effects and particles · designs sound · generates images ·
generates 3D models · looks at what it built and critiques itself · runs playtests · searches the
Roblox documentation · remembers what you did together.

## D. What the model holds in its head

| id | clause |
|---|---|
| D1 | Luau modules that were RUN against their own checks — cooldown, currency, scoring, percentages, inventory, XP, rounds. It installs what was proven instead of rewriting it |
| D2 | Construction files: genres (tycoon, obby, horror, racing, roleplay, survival, tower defense, anime, pet sim) and screens (shop, inventory, rewards, codes, leaderboard, settings, HUD, battle pass). Stroke weights, radii, tiles per row — measured from real games |
| D3 | Ready-made system modules: data saving, purchases, economy, leaderboard, rounds, checkpoints |
| D4 | And when it does not know something, it says "I have not checked that" instead of inventing |

## E. Studio

E1 One pairing code and it is connected · E2 It says connected only when it IS connected — no green
dot that lies · E3 Studio closes and that is said immediately.

## F. Projects

F1 One project is one experience: name, description, when updated, which place · F2 search, tag, pin,
archive, export everything, delete · F3 share by link — a friend opens and sees; a viewer cannot
edit; revoking disconnects immediately.

## G. The account

G1 Sees credits left, and what the next request will cost · G2 downloads all their data ·
G3 signs out of every device · G4 **their projects train no model. Full stop. No switch, no opt-in,
no asterisk.**

## H. The site

H1 A home page that says what this is without hype · H2 pricing with no small print · H3 docs that
answer a real question · H4 a changelog that corrects mistakes in the open instead of deleting them ·
H5 a real status page · H6 light and dark, and built FOR the phone rather than "works on phones too".

## I. When something breaks

I1 An error says what happened and what to do — never "something went wrong" · I2 we know before the
user complains · I3 there is a number for "how many runs fail" and it is not biased in our favour.

## J. Under the lid

J1 Every figure shown was measured, not estimated · J2 every promise has code behind it · J3 every
guard was seen to fail before it was trusted · J4 a blocker stays open, and named, until it is
actually closed.

## K. The money

K1 No credit cards. Robux · K2 the plugin in the Creator Store · K3 passes inside the game ·
K4 Robux, at fifteen, with no bank account.
