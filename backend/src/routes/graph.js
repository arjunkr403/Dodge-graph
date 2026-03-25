import express from 'express';
import { getGraph, getNodeNeighborhood } from '../graph/graphBuilder.js';
import { poolConnected, lastConnectionError } from '../config/db.js';

const router = express.Router();

// GET /api/graph — full graph (cached)
router.get('/', async (req, res) => {
  try {
    if (!poolConnected) {
      return res.status(503).json({
        error: 'Database connection unavailable',
        detail: lastConnectionError?.message || 'PostgreSQL is not running or unreachable',
        status: 'degraded',
      });
    }

    const graph = await getGraph(req.query.refresh === 'true');
    res.json(graph);
  } catch (err) {
    console.error('Graph build error:', err.message);
    const statusCode = err.code === 'ECONNREFUSED' ? 503 : 500;
    res.status(statusCode).json({
      error: 'Failed to build graph',
      detail: err.message,
      status: 'error',
    });
  }
});

// GET /api/graph/node/:id/expand — 1-hop neighborhood for expand-on-click
router.get('/node/:id/expand', async (req, res) => {
  try {
    if (!poolConnected) {
      return res.status(503).json({
        error: 'Database connection unavailable',
        detail: lastConnectionError?.message || 'PostgreSQL is not running or unreachable',
      });
    }

    const { id } = req.params;
    const { type } = req.query;
    const neighborhood = await getNodeNeighborhood(id, type);
    res.json(neighborhood);
  } catch (err) {
    console.error('Node expansion error:', err.message);
    res.status(500).json({
      error: 'Failed to expand node',
      detail: err.message,
    });
  }
});

export default router;
