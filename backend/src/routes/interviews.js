import express from 'express';
import { body, param } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import * as interviewController from '../controllers/interviewController.js';
import { dataMaskingMiddleware } from '../middleware/dataMasking.js';

const router = express.Router();

router.use(authenticateToken);
router.use(dataMaskingMiddleware);

// 인터뷰 생성
router.post('/project/:projectId', [
  param('projectId').isInt(),
  body('interview_type').isIn(['voice', 'text', 'upload']),
  body('text').trim().optional(),
  body('transcription').trim().optional(),
  body('domain_l3_id').isInt().optional()
], interviewController.createInterview);

// 프로젝트의 모든 인터뷰 조회
router.get('/project/:projectId', [
  param('projectId').isInt()
], interviewController.getInterviews);

// 인터뷰 AI 분석 (Draft 생성)
router.post('/:interviewId/analyze', [
  param('interviewId').isInt()
], (req, res) => {
  const projectId = req.body.projectId;
  const interviewId = req.params.interviewId;
  req.params.projectId = projectId;
  req.params.interviewId = interviewId;
  interviewController.analyzeInterview(req, res);
});

// 프로젝트의 모든 프로세스 (L4~L6) 조회
router.get('/project/:projectId/processes', [
  param('projectId').isInt()
], interviewController.getProcesses);

// 개별 프로세스 업데이트
router.put('/process/:processId', [
  param('processId').isInt(),
  body('name').trim().optional(),
  body('description').trim().optional(),
  body('execution_time').isInt().optional(),
  body('method').optional(),
  body('tool').optional(),
  body('status').isIn(['draft', 'confirmed', 'optimized']).optional()
], interviewController.updateProcess);

export default router;
