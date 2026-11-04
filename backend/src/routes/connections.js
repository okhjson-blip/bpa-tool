import express from 'express';
import * as connectionController from '../controllers/connectionController.js';

const router = express.Router();

// 협력사 전용 Key 등록은 중단. 시스템 AI 풀 가용 상태만 노출한다.
router.get('/', connectionController.getConnections);
router.put('/:engine', connectionController.saveConnection);
router.delete('/:engine', connectionController.deleteConnection);
router.put('/:engine/default', connectionController.setDefaultConnection);

export default router;
