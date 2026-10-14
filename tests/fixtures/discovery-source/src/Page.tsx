import { cancelOrder } from './service.js';
export const Page = () => <button onClick={() => cancelOrder({ id: '1', state: 'pending' })}>取消订单</button>;
