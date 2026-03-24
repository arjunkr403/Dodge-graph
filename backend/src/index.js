import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import graphRoutes from './routes/graph.js';
import chatRoutes from './routes/chat.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/graph', graphRoutes);
app.use('/api/chat', chatRoutes);

app.listen(PORT, () => {
  console.log(` Dodge Graph API running on http://localhost:${PORT}`);
  console.log(`   Graph: http://localhost:${PORT}/api/graph`);
  console.log(`   Chat:  http://localhost:${PORT}/api/chat`);
});
