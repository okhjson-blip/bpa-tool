import express from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { requireCompanyWrite } from '../middleware/auth.js';
import * as draftController from '../controllers/draftController.js';

const router = express.Router();
const panelKeys = ['project_basic', 'task_basic', 'interview_answers', 'process_editor', 'report_frequency'];

router.get('/:panelKey', [
  param('panelKey').isIn(panelKeys),
  query('scope_key').isString().trim().isLength({ min: 1, max: 200 })
], validate, draftController.getDraft);

router.put('/:panelKey', requireCompanyWrite, [
  param('panelKey').isIn(panelKeys),
  body('scope_key').isString().trim().isLength({ min: 1, max: 200 }),
  body('payload').isObject(),
  body('project_id').isInt().optional({ nullable: true }),
  body('task_id').isInt().optional({ nullable: true })
], validate, draftController.saveDraft);

router.delete('/:panelKey', requireCompanyWrite, [
  param('panelKey').isIn(panelKeys),
  query('scope_key').isString().trim().isLength({ min: 1, max: 200 })
], validate, draftController.deleteDraft);

export default router;
