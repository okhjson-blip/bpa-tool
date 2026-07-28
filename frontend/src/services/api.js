import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: API_URL
});

// No authentication headers needed

// Auth API
export const authAPI = {
  signup: (data) => api.post('/auth/signup', data),
  login: (data) => api.post('/auth/login', data),
  requestPasswordReset: (email) => api.post('/auth/request-password-reset', { email }),
  resetPassword: (token, newPassword) => api.post('/auth/reset-password', { token, newPassword })
};

// Projects API
export const projectsAPI = {
  create: (data) => api.post('/projects', data),
  list: () => api.get('/projects'),
  get: (id) => api.get(`/projects/${id}`),
  update: (id, data) => api.put(`/projects/${id}`, data),
  delete: (id) => api.delete(`/projects/${id}`),
  addMember: (projectId, data) => api.post(`/projects/${projectId}/members`, data)
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
  analyze: (interviewId, projectId) =>
    api.post(`/interviews/${interviewId}/analyze`, { projectId }),
  getProcesses: (projectId) => api.get(`/interviews/project/${projectId}/processes`),
  updateProcess: (processId, data) => api.put(`/interviews/process/${processId}`, data)
};

// Analysis API
export const analysisAPI = {
  tagBDW: (processId, data) => api.post(`/analysis/process/${processId}/bdw`, data),
  getBDWDiagnosis: (projectId) => api.get(`/analysis/project/${projectId}/bdw`),
  analyzeAIFit: (projectId, data) => api.post(`/analysis/project/${projectId}/ai-fit`, data),
  createToBe: (projectId, data) => api.post(`/analysis/project/${projectId}/to-be`, data),
  generateReport: (projectId) => api.get(`/analysis/project/${projectId}/report`)
};

export default api;
