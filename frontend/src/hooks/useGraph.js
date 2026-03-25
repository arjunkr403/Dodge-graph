import { useState, useEffect, useCallback } from 'react';
import { fetchGraph, expandNode as expandNodeAPI } from '../api/index.js';

export function useGraph() {
  const [graphData,    setGraphData]    = useState({ nodes: [], links: [] });
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [meta,         setMeta]         = useState(null);
  const [highlightNodes, setHighlight]  = useState(new Set());

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
        // After force-graph processes links, source/target become objects — normalize both cases
        const existingNodeIds = new Set(prev.nodes.map(n => n.id));
        const existingLinkKeys = new Set(prev.links.map(l => {
          const s = typeof l.source === 'object' ? l.source.id : l.source;
          const t = typeof l.target === 'object' ? l.target.id : l.target;
          return `${s}→${t}`;
        }));

        const addNodes = newNodes.filter(n => !existingNodeIds.has(n.id));
        const addLinks = newLinks.filter(l => {
          const s = typeof l.source === 'object' ? l.source.id : l.source;
          const t = typeof l.target === 'object' ? l.target.id : l.target;
          return !existingLinkKeys.has(`${s}→${t}`);
        });

        return {
          nodes: [...prev.nodes, ...addNodes],
          links: [...prev.links, ...addLinks],
        };
      });
    } catch (err) {
      console.error('Expand node error:', err);
    }
  }, []);

  const highlightByIds = useCallback((ids) => {
    setHighlight(new Set(ids));
    setTimeout(() => setHighlight(new Set()), 4000);
  }, []);

  return { graphData, loading, error, meta, loadGraph, expandNode, highlightNodes: highlightNodes, highlightByIds };
}
