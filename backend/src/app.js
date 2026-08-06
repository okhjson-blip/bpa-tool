import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import projectRoutes from './routes/projects.js';
import domainRoutes from './routes/domains.js';
import interviewRoutes from './routes/interviews.js';
import analysisRoutes from './routes/analysis.js';
import connectionRoutes from './routes/connections.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// 정적 파일 서빙 (Frontend 빌드 결과)
const distPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(distPath));

// Health check
const healthHandler = async (req, res) => {
  try {
    await initializeDatabase();
    res.json({ status: 'OK', database: 'supabase' });
  } catch (error) {
    res.status(503).json({ status: 'ERROR', database: 'supabase', error: error.message });
  }
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Routes
app.use('/api/projects', projectRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/connections', connectionRoutes);

// Error handler
app.use(errorHandler);

// SPA 라우팅: API가 아닌 모든 요청을 index.html로
if (!process.env.VERCEL) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Database initialization 및 서버 시작
const startServer = async () => {
  try {
    await initializeDatabase();
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`✓ 서버가 포트 ${PORT}에서 실행 중입니다`);
    });
  } catch (error) {
    console.error('서버 시작 실패:', error);
    process.exit(1);
  }
};

if (!process.env.VERCEL) {
  startServer();
}

export default app;
