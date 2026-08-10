import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate.js';
import * as projectController from '../controllers/projectController.js';
import { requireCompanyWrite } from '../middleware/auth.js';

const router = express.Router();

router.post('/', requireCompanyWrite, [
  body('name').trim().notEmpty(),
  body('department_name').trim().notEmpty(),
  body('business_name').trim().notEmpty(),
  body('analysis_goal').trim().notEmpty(),
  body('start_date').isISO8601({ strict: true }),
  body('end_date').isISO8601({ strict: true }),
  body('ai_engine').isIn(['gemini', 'chatgpt', 'claude']).optional(),
  body('participants').isArray()
], validate, projectController.createProject);

router.get('/', projectController.getProjects);

router.get('/:projectId', [
  param('projectId').isInt()
], validate, projectController.getProject);

router.put('/:projectId', requireCompanyWrite, [
  param('projectId').isInt(),
  body('name').trim().optional(),
  body('department_name').trim().optional(),
  body('business_name').trim().optional(),
  body('analysis_goal').trim().optional(),
  body('start_date').isISO8601({ strict: true }).optional(),
  body('end_date').isISO8601({ strict: true }).optional(),
  body('participants').isArray().optional()
], validate, projectController.updateProject);

router.delete('/:projectId', requireCompanyWrite, [
  param('projectId').isInt()
], validate, projectController.deleteProject);

router.get('/:projectId/tasks', [param('projectId').isInt()], validate, projectController.getTasks);

router.post('/:projectId/tasks', requireCompanyWrite, [
  param('projectId').isInt(),
  body('name').trim().notEmpty(),
  body('l4').trim().notEmpty(),
  body('goal').trim().notEmpty(),
  body('start_date').isISO8601({ strict: true }),
  body('end_date').isISO8601({ strict: true }),
  body('participants').isArray()
], validate, projectController.createTask);

router.put('/:projectId/tasks/:taskId', requireCompanyWrite, [
  param('projectId').isInt(),
  param('taskId').isInt(),
  body('name').trim().notEmpty(),
  body('l4').trim().notEmpty(),
  body('goal').trim().notEmpty(),
  body('start_date').isISO8601({ strict: true }),
  body('end_date').isISO8601({ strict: true }),
  body('participants').isArray()
], validate, projectController.updateTask);

router.delete('/:projectId/tasks/:taskId', requireCompanyWrite, [
  param('projectId').isInt(),
  param('taskId').isInt()
], validate, projectController.deleteTask);

// Member route removed - no longer used

export default router;
