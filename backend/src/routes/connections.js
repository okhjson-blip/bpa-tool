import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { requireCompanyWrite } from '../middleware/auth.js';
import * as connectionController from '../controllers/connectionController.js';

const router = express.Router();

router.get('/', connectionController.getConnections);
router.put('/:engine', requireCompanyWrite, [
  param('engine').isIn(['chatgpt', 'gemini', 'claude']),
  body('apiKey').isString().trim().isLength({ min: 10 })
], validate, connectionController.saveConnection);
router.delete('/:engine', requireCompanyWrite, [
  param('engine').isIn(['chatgpt', 'gemini', 'claude'])
], validate, connectionController.deleteConnection);
router.put('/:engine/default', requireCompanyWrite, [
  param('engine').isIn(['chatgpt', 'gemini', 'claude'])
], validate, connectionController.setDefaultConnection);

export default router;
