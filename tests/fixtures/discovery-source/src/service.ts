export interface Order { id: string; state: 'pending' | 'cancelled' }
export function cancelOrder(order: Order) {
  if (order.state === 'pending') order.state = 'cancelled';
  return order;
}
