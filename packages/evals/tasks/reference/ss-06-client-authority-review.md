It does nothing useful and it is trivially exploitable at the same time. Writing to `coins.Value`
inside a LocalScript changes only that client's copy of the IntValue — the write does not replicate
to the server, so the balance snaps back the moment anything on the server touches it, and the shop
appears to work only until the player rejoins. Meanwhile the server hands out a sword on
`GiveSword:FireServer()` without checking anything at all, so any executor can fire that RemoteEvent
in a loop and take swords for free while never spending a coin. The server has to own the whole
transaction: the client may send an item id and nothing else, and the server looks up the price,
verifies the balance, deducts it and grants the tool.
