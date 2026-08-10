import express from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authenticateAdminSession } from '../middleware/auth.js';
import * as adminController from '../controllers/adminController.js';

const router = express.Router();
router.use(authenticateAdminSession);

router.get('/overview', adminController.getOverview);
router.get('/companies', adminController.getCompanies);
router.get('/users', adminController.getCompanyUsers);
router.post('/users', [
  body('company_id').isInt({ min: 1 }),
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('email').trim().isEmail().isLength({ max: 254 })
], validate, adminController.createCompanyUser);
router.patch('/users/:userId', [
  param('userId').isInt(),
  body('company_id').isInt({ min: 1 }),
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('email').trim().isEmail().isLength({ max: 254 })
], validate, adminController.updateCompanyUser);
router.delete('/users/:userId', [
  param('userId').isInt()
], validate, adminController.deleteCompanyUser);
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
router.delete('/companies/:companyId', [
  param('companyId').isInt()
], validate, adminController.deleteCompany);
router.delete('/projects/:projectId', [
  param('projectId').isInt()
], validate, adminController.deleteProject);
router.delete('/tasks/:taskId', [
  param('taskId').isInt()
], validate, adminController.deleteTask);
router.patch('/companies/:companyId/status', [
  param('companyId').isInt(),
  body('status').isIn(['active', 'suspended'])
], validate, adminController.updateCompanyStatus);

export default router;
