import express from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authenticateAdminSession } from '../middleware/auth.js';
import * as adminController from '../controllers/adminController.js';
import * as adminAiController from '../controllers/adminAiController.js';
import { SYSTEM_AI_PROVIDERS } from '../services/systemCredentialService.js';

const router = express.Router();
router.use(authenticateAdminSession);

router.get('/overview', adminController.getOverview);
router.get('/ai-credentials', adminAiController.listAdminAiCredentials);
router.post('/ai-credentials', [
  body('provider').isIn(SYSTEM_AI_PROVIDERS),
  body('apiKey').isString().trim().isLength({ min: 10 }),
  body('model').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body('display_name').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body('priority').optional({ nullable: true }).isInt({ min: 1, max: 9999 })
], validate, adminAiController.saveAdminAiCredential);
router.put('/ai-credentials/reorder', [
  body('ordered_ids').isArray({ min: 1 }),
  body('ordered_ids.*').isInt({ min: 1 })
], validate, adminAiController.reorderAdminAiCredentials);
router.put('/ai-credentials/:id', [
  param('id').isInt({ min: 1 }),
  body('provider').isIn(SYSTEM_AI_PROVIDERS),
  body('apiKey').isString().trim().isLength({ min: 10 }),
  body('model').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body('display_name').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body('priority').optional({ nullable: true }).isInt({ min: 1, max: 9999 })
], validate, adminAiController.saveAdminAiCredential);
router.delete('/ai-credentials/:id', [
  param('id').isInt({ min: 1 })
], validate, adminAiController.deleteAdminAiCredential);
router.patch('/ai-credentials/:id/priority', [
  param('id').isInt({ min: 1 }),
  body('priority').isInt({ min: 1, max: 9999 })
], validate, adminAiController.updateAdminAiPriority);
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
