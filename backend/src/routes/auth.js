import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authenticate, authenticateAdminSession } from '../middleware/auth.js';
import * as authController from '../controllers/authController.js';

const router = express.Router();

router.get('/companies', authController.getActiveCompanies);
router.post('/admin-login', [body('password').isString().notEmpty()], validate, authController.adminLogin);
router.get('/admin-session', authenticateAdminSession, authController.getAdminSession);
router.post('/admin-logout', authController.adminLogout);
router.get('/me', authenticate, authController.getMe);
router.post('/complete-profile', authenticate, [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('company_id').isInt()
], validate, authController.completeProfile);

export default router;
