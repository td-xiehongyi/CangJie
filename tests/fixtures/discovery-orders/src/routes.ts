import express from 'express';
import { cancelOrder } from './orders.js';
const router = express.Router();
router.post('/orders/:id/cancel', cancelOrder);
export { router };
