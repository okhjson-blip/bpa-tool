import express from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validate.js';
import * as interviewController from '../controllers/interviewController.js';
import { dataMaskingMiddleware } from '../middleware/dataMasking.js';
import { requireCompanyWrite } from '../middleware/auth.js';

const router = express.Router();

router.use(dataMaskingMiddleware);

// 인터뷰 생성
router.post('/project/:projectId', requireCompanyWrite, [
  param('projectId').isInt(),
  body('interview_type').isIn(['voice', 'text', 'upload']),
  body('taskId').isInt().optional(),
  body('answers').isArray().optional(),
  body('answers.*').isString().optional(),
  body('text').trim().optional(),
  body('transcription').trim().optional(),
  body('domain_l3_id').isInt().optional()
], validate, interviewController.createInterview);

router.get('/project/:projectId/task/:taskId/latest', [
  param('projectId').isInt(),
  param('taskId').isInt()
], validate, interviewController.getLatestTaskInterview);

// 프로젝트의 모든 인터뷰 조회
router.get('/project/:projectId', [
  param('projectId').isInt()
], validate, interviewController.getInterviews);

// 인터뷰 AI 분석 (Draft 생성)
router.post('/:interviewId/analyze', requireCompanyWrite, [
  param('interviewId').isInt(),
  body('projectId').isInt(),
  body('taskId').isInt().optional()
], validate, (req, res) => {
  req.params.projectId = req.body.projectId;
  interviewController.analyzeInterview(req, res);
});

// 프로젝트의 모든 프로세스(L4 모듈, L5 단위, L6 Act) 조회
router.get('/project/:projectId/processes', [
  param('projectId').isInt(),
  query('task_id').isInt().optional()
], validate, interviewController.getProcesses);

router.put('/processes/sync', requireCompanyWrite, [
  body('processes').isArray({ min: 1, max: 500 }),
  body('processes.*.id').isInt(),
  body('processes.*.name').trim().notEmpty(),
  body('processes.*.description').isString().optional(),
  body('processes.*.execution_time').isInt({ min: 0 }),
  body('processes.*.waiting_time').isFloat({ min: 0 }),
  body('processes.*.approval_waiting_time').isFloat({ min: 0 }),
  body('processes.*.method').isIn(['manual', 'system']),
  body('processes.*.tool').isIn(['email', 'document', 'excel', 'web', 'erp', 'other'])
], validate, interviewController.syncProcesses);

// 개별 프로세스 업데이트
router.put('/process/:processId', requireCompanyWrite, [
  param('processId').isInt(),
  body('name').trim().optional(),
  body('description').trim().optional(),
  body('execution_time').isInt().optional({ nullable: true }),
  body('waiting_time').isFloat({ min: 0 }).optional(),
  body('approval_waiting_time').isFloat({ min: 0 }).optional(),
  body('method').optional(),
  body('tool').optional(),
  body('status').isIn(['draft', 'confirmed', 'optimized']).optional()
], validate, interviewController.updateProcess);

export default router;
