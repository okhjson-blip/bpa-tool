import express from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/authController.js';

const router = express.Router();

router.post('/signup', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().notEmpty(),
  body('role').isIn(['admin', 'consultant', 'client']).optional()
], authController.signup);

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], authController.login);

router.post('/request-password-reset', [
  body('email').isEmail().normalizeEmail()
], authController.requestPasswordReset);

router.post('/reset-password', [
  body('token').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], authController.resetPassword);

export default router;
