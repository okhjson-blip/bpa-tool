import express from 'express';
import { body, param } from 'express-validator';
import * as domainController from '../controllers/domainController.js';

const router = express.Router();

router.get('/project/:projectId', [
  param('projectId').isInt()
], domainController.getDomainTree);

router.post('/project/:projectId', [
  param('projectId').isInt(),
  body('level').isIn(['L1', 'L2', 'L3']),
  body('name').trim().notEmpty(),
  body('description').trim().optional(),
  body('parentId').isInt().optional()
], domainController.addDomain);

router.put('/:domainId', [
  param('domainId').isInt(),
  body('name').trim().optional(),
  body('description').trim().optional()
], domainController.updateDomain);

router.delete('/:domainId', [
  param('domainId').isInt()
], domainController.deleteDomain);

export default router;
