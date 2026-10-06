A gamepass perk the server gives to owners: speed (WalkSpeed x amount), jump (JumpPower x amount) or multiplier
(GamepassPerk.multiplier(player) for earning scripts). Ownership is checked with MarketplaceService on join and after a
purchase in game. passId 0 is a placeholder until the creator makes the pass on the Creator Dashboard; testInStudio
gives everyone the perk in Studio playtests so it can be tried. A hud button with action pass:<id> sells it.
