```luau
--!strict

export type Inventory = { [string]: number }

local InventoryUtil = {}

function InventoryUtil.count(inventory: Inventory, item: string): number
	return inventory[item] or 0
end

-- Returns a new table. Mutating the argument makes every holder of that inventory observe a change
-- they never asked for, which is the bug class strict mode cannot catch for you.
function InventoryUtil.add(inventory: Inventory, item: string, count: number): Inventory
	local updated: Inventory = table.clone(inventory)
	updated[item] = InventoryUtil.count(inventory, item) + count
	return updated
end

return InventoryUtil
```
