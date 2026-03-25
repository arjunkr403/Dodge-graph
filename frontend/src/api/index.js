import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const api = axios.create({
  baseURL: BASE,
  timeout: 30000,
});

export const fetchGraph = () => api.get('/graph').then(r => r.data);

export const expandNode = (id, type) =>
  api.get(`/graph/node/${encodeURIComponent(id)}/expand`, { params: { type } }).then(r => r.data);

export const sendChat = (message, history) =>
  api.post('/chat', { message, history }).then(r => r.data);

export const fetchSuggestions = () =>
  api.get('/chat/suggestions').then(r => r.data);

export default api;