import express from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authenticateAdminSession } from '../middleware/auth.js';
import * as adminController from '../controllers/adminController.js';

const router = express.Router();
router.use(authenticateAdminSession);

router.get('/overview', adminController.getOverview);
router.get('/tasks/:taskId/report', [
  param('taskId').isInt()
], validate, adminController.getTaskReport);
router.get('/tasks.csv', [
  query('consulting_year').isInt({ min: 2000, max: 2100 }),
  query('consulting_half').isIn(['상반기', '하반기'])
], validate, adminController.exportTaskCsv);
router.post('/companies', [
  body('name').trim().notEmpty(),
  body('consulting_year').isInt({ min: 2000, max: 2100 }),
  body('consulting_half').isIn(['상반기', '하반기'])
], validate, adminController.createCompany);
router.patch('/companies/:companyId/status', [
  param('companyId').isInt(),
  body('status').isIn(['active', 'suspended'])
], validate, adminController.updateCompanyStatus);

export default router;
