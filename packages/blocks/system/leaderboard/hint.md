A global leaderboard for one currency (or a stat in leaderstats): every `every` seconds the server writes each
player's value to an OrderedDataStore and publishes the top `size` as ReplicatedStorage.Leaderboard_<stat> (a folder of
StringValues Rank1..RankN, each "Name|Value"); in Studio, unpublished, it ranks the players in the server instead. A
row-list on the same screen fills itself from it. Needs the currency block or leaderstats.
