import express from 'express';
import { param, body, query } from 'express-validator';
import { validate } from '../middleware/validate.js';
import * as bdwController from '../controllers/bdwController.js';
import { requireCompanyWrite } from '../middleware/auth.js';

const router = express.Router();

// BDW 태그 부착
router.post('/process/:processId/bdw', requireCompanyWrite, [
  param('processId').isInt(),
  body('bdw_type').isIn(['bottleneck', 'delay', 'waste', 'normal'])
], validate, bdwController.tagBDW);

// 등록된 프로젝트 AI 엔진으로 BDW 진단 실행
router.post('/project/:projectId/bdw/analyze', requireCompanyWrite, [
  param('projectId').isInt(),
  body('taskId').isInt()
], validate, bdwController.analyzeBDW);

// BDW 진단 조회
router.get('/project/:projectId/bdw', [
  param('projectId').isInt(),
  query('task_id').isInt().optional()
], validate, bdwController.getBDWDiagnosis);

// AI FIT 분석
router.post('/project/:projectId/ai-fit', requireCompanyWrite, [
  param('projectId').isInt(),
  body('taskId').isInt()
], validate, bdwController.analyzeAIFit);

router.get('/project/:projectId/ai-fit', [
  param('projectId').isInt(),
  query('task_id').isInt()
], validate, bdwController.getStoredAIFit);

// To-Be 프로세스 생성
router.post('/project/:projectId/to-be', requireCompanyWrite, [
  param('projectId').isInt(),
  body('taskId').isInt(),
  body('accepted_process_ids').isArray({ min: 1 }),
  body('accepted_process_ids.*').isInt()
], validate, bdwController.createToBe);

// 최종 리포트 생성
router.get('/project/:projectId/report/saved', [
  param('projectId').isInt(),
  query('task_id').isInt()
], validate, bdwController.getSavedReport);

router.get('/project/:projectId/report', requireCompanyWrite, [
  param('projectId').isInt(),
  query('task_id').isInt(),
  query('frequency_unit').isIn(['day', 'week', 'month', 'year']).optional(),
  query('frequency_count').isInt({ min: 1, max: 10000 }).optional(),
  query('annual_frequency').isInt({ min: 1, max: 1000000 }).optional()
], validate, bdwController.generateReport);

router.post('/project/:projectId/report/save', requireCompanyWrite, [
  param('projectId').isInt(),
  body('taskId').isInt(),
  body('frequency_unit').isIn(['day', 'week', 'month', 'year']).optional(),
  body('frequency_count').isInt({ min: 1, max: 10000 }).optional(),
  body('annual_frequency').isInt({ min: 1, max: 1000000 }).optional()
], validate, bdwController.saveReport);

router.get('/project/:projectId/report.csv', [
  param('projectId').isInt(),
  query('task_id').isInt()
], validate, bdwController.exportTaskCsv);

export default router;
