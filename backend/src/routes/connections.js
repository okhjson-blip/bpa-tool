import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.js';
import LLMService from '../services/llmService.js';

const router = express.Router();

router.post('/test', [
  body('engine').isIn(['chatgpt', 'gemini', 'claude']),
  body('apiKey').isString().trim().notEmpty()
], validate, async (req, res) => {
  try {
    await LLMService.testConnection(req.body.engine, req.body.apiKey);
    res.json({ connected: true, message: 'API 연결이 확인되었습니다.' });
  } catch (error) {
    const status = error.code === 'INVALID_API_KEY' ? 401 : 502;
    res.status(status).json({
      connected: false,
      error: error.userMessage || 'API 공급자에 연결할 수 없습니다.'
    });
  }
});

export default router;
