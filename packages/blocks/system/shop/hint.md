Makes buying real: ReplicatedStorage.ShopBuy(name) is answered by the server, which refuses an unknown item, one
already owned (when once is true) or one the player cannot afford, and otherwise spends the currency and records it.
Use the same names and prices as the item-grid cards and set the grid's payWith to the currency. Owned items are saved
and shown as the player attribute Owns_<name without spaces>. Other server scripts read Shop ownership with
Currency.getData(player, "Owned").
