import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL
});

// Projects API
export const projectsAPI = {
  create: (data) => api.post('/projects', data),
  list: (companyName) => api.get('/projects', {
    params: companyName ? { company_name: companyName } : undefined
  }),
  get: (id) => api.get(`/projects/${id}`),
  update: (id, data) => api.put(`/projects/${id}`, data),
  delete: (id) => api.delete(`/projects/${id}`)
};

// Domains API
export const domainsAPI = {
  getTree: (projectId) => api.get(`/domains/project/${projectId}`),
  add: (projectId, data) => api.post(`/domains/project/${projectId}`, data),
  update: (id, data) => api.put(`/domains/${id}`, data),
  delete: (id) => api.delete(`/domains/${id}`)
};

// Interviews API
export const interviewsAPI = {
  create: (projectId, data) => api.post(`/interviews/project/${projectId}`, data),
  list: (projectId) => api.get(`/interviews/project/${projectId}`),
  analyze: (interviewId, projectId, apiKey, taskId) =>
    api.post(`/interviews/${interviewId}/analyze`, { projectId, apiKey, taskId }),
  getProcesses: (projectId, taskId) => api.get(`/interviews/project/${projectId}/processes`, {
    params: taskId ? { task_id: taskId } : undefined
  }),
  updateProcess: (processId, data) => api.put(`/interviews/process/${processId}`, data)
};

// Analysis API
export const analysisAPI = {
  tagBDW: (processId, data) => api.post(`/analysis/process/${processId}/bdw`, data),
  analyzeBDW: (projectId, taskId, apiKey) =>
    api.post(`/analysis/project/${projectId}/bdw/analyze`, { taskId, apiKey }),
  getBDWDiagnosis: (projectId, taskId) => api.get(`/analysis/project/${projectId}/bdw`, {
    params: taskId ? { task_id: taskId } : undefined
  }),
  analyzeAIFit: (projectId, taskId, apiKey) =>
    api.post(`/analysis/project/${projectId}/ai-fit`, { taskId, apiKey }),
  createToBe: (projectId, taskId, analysis) =>
    api.post(`/analysis/project/${projectId}/to-be`, { taskId, ai_analysis: analysis }),
  generateReport: (projectId, taskId) => api.get(`/analysis/project/${projectId}/report`, {
    params: { task_id: taskId }
  })
};

export default api;
