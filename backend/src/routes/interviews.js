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
  body('text').trim().optional(),
  body('transcription').trim().optional(),
  body('domain_l3_id').isInt().optional()
], validate, interviewController.createInterview);

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

// 프로젝트의 모든 프로세스 (L4~L6) 조회
router.get('/project/:projectId/processes', [
  param('projectId').isInt(),
  query('task_id').isInt().optional()
], validate, interviewController.getProcesses);

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
