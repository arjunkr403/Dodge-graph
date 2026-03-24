import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
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
