import express from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validate.js';
import * as projectController from '../controllers/projectController.js';

const router = express.Router();

router.post('/', [
  body('name').trim().notEmpty(),
  body('company_name').trim().notEmpty(),
  body('department_name').trim().notEmpty(),
  body('business_name').trim().notEmpty(),
  body('analysis_goal').trim().notEmpty(),
  body('start_date').isISO8601({ strict: true }),
  body('end_date').isISO8601({ strict: true }),
  body('ai_engine').isIn(['gemini', 'chatgpt', 'claude']).optional(),
  body('participants').isArray()
], validate, projectController.createProject);

router.get('/', [
  query('company_name').optional().trim().notEmpty()
], validate, projectController.getProjects);

router.get('/:projectId', [
  param('projectId').isInt()
], validate, projectController.getProject);

router.put('/:projectId', [
  param('projectId').isInt(),
  body('name').trim().optional(),
  body('company_name').trim().optional(),
  body('department_name').trim().optional(),
  body('business_name').trim().optional(),
  body('analysis_goal').trim().optional(),
  body('start_date').isISO8601({ strict: true }).optional(),
  body('end_date').isISO8601({ strict: true }).optional(),
  body('participants').isArray().optional()
], validate, projectController.updateProject);

router.delete('/:projectId', [
  param('projectId').isInt()
], validate, projectController.deleteProject);

router.get('/:projectId/tasks', [param('projectId').isInt()], validate, projectController.getTasks);

router.post('/:projectId/tasks', [
  param('projectId').isInt(),
  body('name').trim().notEmpty(),
  body('l4').trim().notEmpty(),
  body('goal').trim().notEmpty(),
  body('start_date').isISO8601({ strict: true }),
  body('end_date').isISO8601({ strict: true }),
  body('participants').isArray()
], validate, projectController.createTask);

// Member route removed - no longer used

export default router;
