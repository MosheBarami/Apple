The money of the game, owned by the server: each currency (name, start) shows in leaderstats and as a player
attribute. Other server scripts use require(game.ServerScriptService.Currency): Currency.grant(player, "Coins", 10,
"reason"), Currency.spend(player, "Coins", 50, "reason") -> true/false, Currency.get(player, "Coins"),
Currency.getData/setData(player, key, value) for other saved progress. Lifetime earnings are kept as <name>Earned. Saving needs a published place; a failed load is
never saved over. Choose it for anything that earns, buys or saves.
