import { Router } from 'express';
import { streamChat, getHistory, clearHistory, listSessions, healthCheck } from '../controllers/chatController.js';

const router = Router();

router.get('/sessions', listSessions);
router.post('/chat', streamChat);
router.get('/chat/:sessionId', getHistory);
router.delete('/chat', clearHistory);
router.get('/health', healthCheck);

export default router;
