export const orders = new Map<string, { state: string; itemId: string; ownerId: string }>();
export function releaseInventory(itemId: string) { return { itemId, released: 1 }; }
