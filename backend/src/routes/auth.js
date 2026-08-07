import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import * as authController from '../controllers/authController.js';

const router = express.Router();

router.get('/companies', authController.getActiveCompanies);
router.get('/me', authenticate, authController.getMe);
router.post('/complete-profile', authenticate, [
  body('name').trim().notEmpty(),
  body('company_id').isInt()
], validate, authController.completeProfile);

export default router;
