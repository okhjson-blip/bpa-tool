import express from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validate.js';
import * as projectController from '../controllers/projectController.js';

const router = express.Router();

router.post('/', [
  body('name').trim().notEmpty(),
  body('l1_domain').trim().optional(),
  body('company_name').trim().notEmpty(),
  body('department_name').trim().optional(),
  body('description').trim().optional(),
  body('analysis_goal').trim().optional(),
  body('analysis_period').trim().optional(),
  body('ai_engine').isIn(['gemini', 'chatgpt', 'claude']).optional(),
  body('participants').isArray().optional()
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
  body('description').trim().optional()
], validate, projectController.updateProject);

router.delete('/:projectId', [
  param('projectId').isInt()
], validate, projectController.deleteProject);

router.get('/:projectId/tasks', [param('projectId').isInt()], validate, projectController.getTasks);

router.post('/:projectId/tasks', [
  param('projectId').isInt(),
  body('name').trim().notEmpty(),
  body('l1').trim().notEmpty(),
  body('l2').trim().notEmpty(),
  body('l3').trim().notEmpty(),
  body('l4').trim().notEmpty(),
  body('participants').isArray().optional()
], validate, projectController.createTask);

// Member route removed - no longer used

export default router;
