import { orders, releaseInventory } from './storage.js';
export function cancelOrder(id: string) {
  const order = orders.get(id);
  if (order && order.state === 'unpaid') {
    order.state = 'cancelled';
    releaseInventory(order.itemId);
  }
  return order;
}
