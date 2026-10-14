import express from 'express';
import { cancelOrder } from './service.js';
const router = express.Router();
router.post('/orders/:id/cancel', cancelOrder);
const dynamicPath = process.env.ORDER_PATH;
router.get(dynamicPath, cancelOrder);
export { router };
