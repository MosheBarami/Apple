The server pays for clicks: ReplicatedStorage.ClickEarn (a RemoteEvent; a hud button with action fire:ClickEarn
sends it). Each click pays amount + perLevel x the level of `upgrade` (from the upgrades block), times the rebirth
multiplier when that block is there; clicks faster than cooldown pay nothing, so autoclickers gain nothing. Needs the
currency block.
