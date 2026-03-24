import { useState, useEffect, useCallback } from 'react';
import { fetchGraph, expandNode as expandNodeAPI } from '../api/index.js';

export function useGraph() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [highlightNodes, setHighlightNodes] = useState(new Set());

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGraph();
      setGraphData({ nodes: data.nodes, links: data.links });
      setMeta(data.meta);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  const expandNode = useCallback(async (nodeId, nodeType) => {
    try {
      const { nodes: newNodes, links: newLinks } = await expandNodeAPI(nodeId, nodeType);
      setGraphData(prev => {
        const existingIds = new Set(prev.nodes.map(n => n.id));
        const existingLinks = new Set(prev.links.map(l => `${l.source}-${l.target}`));
        const filtered = newNodes.filter(n => !existingIds.has(n.id));
        const filteredLinks = newLinks.filter(l => !existingLinks.has(`${l.source}-${l.target}`));
        return {
          nodes: [...prev.nodes, ...filtered],
          links: [...prev.links, ...filteredLinks],
        };
      });
    } catch (err) {
      console.error('Expand node error:', err);
    }
  }, []);

  // Highlight nodes by their IDs (called from chat responses)
  const highlightByIds = useCallback((ids) => {
    setHighlightNodes(new Set(ids));
    setTimeout(() => setHighlightNodes(new Set()), 4000);
  }, []);

  return { graphData, loading, error, meta, loadGraph, expandNode, highlightNodes, highlightByIds };
}
