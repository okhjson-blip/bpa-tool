import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import * as adminController from '../controllers/adminController.js';

const router = express.Router();
router.use(authenticate, requireAdmin);

router.get('/overview', adminController.getOverview);
router.post('/companies', [
  body('name').trim().notEmpty(),
  body('business_number').optional().trim()
], validate, adminController.createCompany);
router.patch('/companies/:companyId/status', [
  param('companyId').isInt(),
  body('status').isIn(['active', 'suspended'])
], validate, adminController.updateCompanyStatus);

export default router;
