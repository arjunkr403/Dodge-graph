import { useRef, useCallback, useState, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const NODE_LABELS = {
  customer: 'Customer',
  product: 'Product',
  sales_order: 'Sales Order',
  sales_order_item: 'SO Item',
  delivery: 'Delivery',
  delivery_item: 'Del. Item',
  billing_document: 'Billing Doc',
  billing_item: 'Bill. Item',
  journal_entry: 'Journal Entry',
  payment: 'Payment',
};

const LEGEND = [
  { type: 'customer',         color: '#1D9E75', label: 'Customer / Product' },
  { type: 'sales_order',      color: '#7F77DD', label: 'Sales Order' },
  { type: 'delivery',         color: '#D85A30', label: 'Delivery / Billing' },
  { type: 'journal_entry',    color: '#BA7517', label: 'Journal / Payment' },
];

export default function GraphCanvas({ graphData, loading, error, onNodeClick, highlightNodes, onRefresh }) {
  const fgRef = useRef();
  const containerRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Responsive sizing
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Center graph on load
  useEffect(() => {
    if (fgRef.current && graphData.nodes.length > 0) {
      setTimeout(() => fgRef.current?.zoomToFit(400, 60), 500);
    }
  }, [graphData.nodes.length]);

  const paintNode = useCallback((node, ctx, globalScale) => {
    const isHighlighted = highlightNodes.has(node.id);
    const isHovered = hoveredNode?.id === node.id;
    const radius = (node.size || 5) * (isHighlighted ? 1.8 : isHovered ? 1.4 : 1);

    // Glow for highlighted nodes
    if (isHighlighted) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 4, 0, 2 * Math.PI);
      ctx.fillStyle = node.color + '44';
      ctx.fill();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = isHighlighted ? '#fff' : node.color + (isHovered ? 'ff' : 'cc');
    ctx.fill();

    if (isHighlighted || isHovered) {
      ctx.strokeStyle = node.color;
      ctx.lineWidth = 1.5 / globalScale;
      ctx.stroke();
    }

    // Label at reasonable zoom
    if (globalScale > 2 || isHighlighted || isHovered) {
      const label = node.label?.length > 14 ? node.label.slice(0, 13) + '…' : (node.label || node.id);
      const fontSize = Math.max(3, 10 / globalScale);
      ctx.font = `${fontSize}px DM Sans, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = isHighlighted ? '#fff' : 'rgba(255,255,255,0.85)';
      ctx.fillText(label, node.x, node.y + radius + 1);
    }
  }, [highlightNodes, hoveredNode]);

  const handleNodeClick = useCallback((node) => {
    if (onNodeClick) onNodeClick(node);
  }, [onNodeClick]);

  const handleNodeHover = useCallback((node, prevNode) => {
    setHoveredNode(node);
  }, []);

  const handleNodeMouseMove = useCallback((node, event) => {
    if (node && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({ x: event.clientX - rect.left + 12, y: event.clientY - rect.top - 10 });
    }
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16 }}>
        <div className="spinner" />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'DM Sans', fontSize: 14 }}>Building graph…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
        <span style={{ color: '#D85A30', fontSize: 14, fontFamily: 'DM Sans' }}>⚠ {error}</span>
        <button onClick={onRefresh} style={{ padding: '6px 16px', background: '#7F77DD22', border: '1px solid #7F77DD66', borderRadius: 6, color: '#AFA9EC', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 13 }}>Retry</button>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={paintNode}
        nodeCanvasObjectMode={() => 'replace'}
        linkColor={() => 'rgba(100,130,200,0.18)'}
        linkWidth={0.6}
        linkDirectionalParticles={1}
        linkDirectionalParticleWidth={1.2}
        linkDirectionalParticleColor={() => 'rgba(127,119,221,0.4)'}
        backgroundColor="transparent"
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onNodeRightClick={() => {}}
        enableNodeDrag
        cooldownTicks={120}
        d3AlphaDecay={0.01}
        d3VelocityDecay={0.25}
      />

      {/* Hover tooltip */}
      {hoveredNode && (
        <div style={{
          position: 'absolute',
          left: tooltipPos.x,
          top: tooltipPos.y,
          background: 'rgba(15,15,25,0.95)',
          border: '1px solid rgba(127,119,221,0.3)',
          borderRadius: 8,
          padding: '8px 12px',
          pointerEvents: 'none',
          zIndex: 100,
          maxWidth: 220,
        }}>
          <div style={{ color: hoveredNode.color, fontSize: 11, fontFamily: 'DM Sans', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            {NODE_LABELS[hoveredNode.type] || hoveredNode.type}
          </div>
          <div style={{ color: '#fff', fontSize: 13, fontFamily: 'DM Mono', wordBreak: 'break-all' }}>
            {hoveredNode.id}
          </div>
          {hoveredNode.data?.net_amount && (
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: 'DM Sans', marginTop: 4 }}>
              {hoveredNode.data.currency} {Number(hoveredNode.data.net_amount).toLocaleString()}
            </div>
          )}
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, fontFamily: 'DM Sans', marginTop: 6 }}>
            Click to inspect · Right-click to expand
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16,
        background: 'rgba(10,10,20,0.7)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10, padding: '10px 14px',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {LEGEND.map(item => (
          <div key={item.type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontFamily: 'DM Sans' }}>{item.label}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4, paddingTop: 6, color: 'rgba(255,255,255,0.25)', fontSize: 10, fontFamily: 'DM Sans' }}>
          {graphData.nodes.length} nodes · {graphData.links.length} edges
        </div>
      </div>

      {/* Zoom controls */}
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          { label: '+', action: () => fgRef.current?.zoom(fgRef.current.zoom() * 1.3, 200) },
          { label: '−', action: () => fgRef.current?.zoom(fgRef.current.zoom() * 0.7, 200) },
          { label: '⊕', action: () => fgRef.current?.zoomToFit(300, 60) },
        ].map(btn => (
          <button key={btn.label} onClick={btn.action} style={{
            width: 28, height: 28, background: 'rgba(10,10,20,0.7)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14,
            fontFamily: 'DM Sans', display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)',
          }}>
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
