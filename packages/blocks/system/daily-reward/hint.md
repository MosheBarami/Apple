A once-a-day reward on the server: the player claims through ReplicatedStorage.DailyClaim() -> ok, message. Coming
back the next day moves the streak on (day 1, 2, 3... paying rewards[day], the last amount repeating); missing a day
starts again at day 1; a second claim the same day is refused. The streak is saved. Player attributes DailyStreak,
DailyReady and DailyNextDay let a screen show it. Needs the currency block. Days are UTC days.
