import express from 'express';
import { getGraph, getNodeNeighborhood } from '../graph/graphBuilder.js';

const router = express.Router();

// GET /api/graph — full graph (cached)
router.get('/', async (req, res) => {
  try {
    const graph = await getGraph(req.query.refresh === 'true');
    res.json(graph);
  } catch (err) {
    console.error('Graph build error:', err);
    res.status(500).json({ error: 'Failed to build graph', detail: err.message });
  }
});

// GET /api/graph/node/:id/expand — 1-hop neighborhood for expand-on-click
router.get('/node/:id/expand', async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query;
    const neighborhood = await getNodeNeighborhood(id, type);
    res.json(neighborhood);
  } catch (err) {
    res.status(500).json({ error: 'Failed to expand node', detail: err.message });
  }
});

export default router;
