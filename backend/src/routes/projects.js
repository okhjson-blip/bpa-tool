import express from 'express';
import { body, param } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import * as projectController from '../controllers/projectController.js';

const router = express.Router();

router.use(authenticateToken);

router.post('/', [
  body('name').trim().notEmpty(),
  body('l1_domain').trim().notEmpty(),
  body('description').trim().optional(),
  body('analysis_goal').trim().optional(),
  body('ai_engine').isIn(['gemini', 'chatgpt', 'claude']).optional()
], projectController.createProject);

router.get('/', projectController.getProjects);

router.get('/:projectId', [
  param('projectId').isInt()
], projectController.getProject);

router.put('/:projectId', [
  param('projectId').isInt(),
  body('name').trim().optional(),
  body('description').trim().optional(),
  body('ai_engine').isIn(['gemini', 'chatgpt', 'claude']).optional()
], projectController.updateProject);

router.delete('/:projectId', [
  param('projectId').isInt()
], projectController.deleteProject);

router.post('/:projectId/members', [
  param('projectId').isInt(),
  body('email').isEmail().normalizeEmail(),
  body('role').isIn(['viewer', 'editor', 'owner'])
], projectController.addProjectMember);

export default router;
