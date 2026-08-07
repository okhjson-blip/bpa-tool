import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate.js';
import * as domainController from '../controllers/domainController.js';
import { requireCompanyWrite } from '../middleware/auth.js';

const router = express.Router();

router.get('/project/:projectId', [
  param('projectId').isInt()
], validate, domainController.getDomainTree);

router.post('/project/:projectId', requireCompanyWrite, [
  param('projectId').isInt(),
  body('level').isIn(['L1', 'L2', 'L3']),
  body('name').trim().notEmpty(),
  body('description').trim().optional(),
  body('parentId').isInt().optional({ nullable: true })
], validate, domainController.addDomain);

router.put('/:domainId', requireCompanyWrite, [
  param('domainId').isInt(),
  body('name').trim().optional(),
  body('description').trim().optional()
], validate, domainController.updateDomain);

router.delete('/:domainId', requireCompanyWrite, [
  param('domainId').isInt()
], validate, domainController.deleteDomain);

export default router;
