Notification popups that stack in a corner: in the game, whenever one of the player's leaderstats goes up, a popup
says "+N <stat>" and fades after `seconds`; other LocalScripts can show their own with the screen's Notify event
(Notify:Fire(icon, text)). `samples` sets how they look (icon, text, colour); they are visible while editing in Studio
only. Pair it with a currency system so there is something to earn.
