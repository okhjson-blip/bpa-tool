import express from 'express';
import { param, body } from 'express-validator';
import { validate } from '../middleware/validate.js';
import * as bdwController from '../controllers/bdwController.js';

const router = express.Router();

// BDW 태그 부착
router.post('/process/:processId/bdw', [
  param('processId').isInt(),
  body('bdw_type').isIn(['bottleneck', 'delay', 'waste', 'normal'])
], validate, bdwController.tagBDW);

// BDW 진단 조회
router.get('/project/:projectId/bdw', [
  param('projectId').isInt()
], validate, bdwController.getBDWDiagnosis);

// AI FIT 분석
router.post('/project/:projectId/ai-fit', [
  param('projectId').isInt()
], validate, bdwController.analyzeAIFit);

// To-Be 프로세스 생성
router.post('/project/:projectId/to-be', [
  param('projectId').isInt(),
  body('ai_analysis').isArray()
], validate, bdwController.createToBe);

// 최종 리포트 생성
router.get('/project/:projectId/report', [
  param('projectId').isInt()
], validate, bdwController.generateReport);

export default router;
