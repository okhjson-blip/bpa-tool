import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate.js';
import * as projectController from '../controllers/projectController.js';

const router = express.Router();

router.post('/', [
  body('name').trim().notEmpty(),
  body('l1_domain').trim().notEmpty(),
  body('description').trim().optional(),
  body('analysis_goal').trim().optional(),
  body('analysis_period').trim().optional(),
  body('ai_engine').optional()
], validate, projectController.createProject);

router.get('/', projectController.getProjects);

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

// Member route removed - no longer used

export default router;
