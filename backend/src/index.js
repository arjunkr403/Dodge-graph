import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import graphRoutes from './routes/graph.js';
import chatRoutes from './routes/chat.js';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,           
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/graph', graphRoutes);
app.use('/api/chat',  chatRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(` Dodge Graph API running on http://localhost:${PORT}`);
  console.log(`   Graph: http://localhost:${PORT}/api/graph`);
  console.log(`   Chat:  http://localhost:${PORT}/api/chat`);
  console.log(`   Allowed origins: ${allowedOrigins.join(', ')}`);
});
