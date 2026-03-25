import { useRef, useCallback, useState, useEffect, useLayoutEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const NODE_TYPE_META = {
  customer:         { color: '#1D9E75', size: 10, label: 'Customer' },
  product:          { color: '#5DCAA5', size:  6, label: 'Product' },
  sales_order:      { color: '#7F77DD', size:  9, label: 'Sales Order' },
  sales_order_item: { color: '#AFA9EC', size:  4, label: 'SO Item' },
  delivery:         { color: '#D85A30', size:  9, label: 'Delivery' },
  delivery_item:    { color: '#F0997B', size:  4, label: 'Delivery Item' },
  billing_document: { color: '#E8593C', size:  8, label: 'Billing Doc' },
  billing_item:     { color: '#F5B8A8', size:  3, label: 'Billing Item' },
  journal_entry:    { color: '#BA7517', size:  7, label: 'Journal Entry' },
  payment:          { color: '#EF9F27', size:  7, label: 'Payment' },
};

export default function GraphCanvas({
  graphData, loading, error, onNodeClick, highlightNodes,
  highlightedNeighbors, selectedNodeId, onRefresh,
}) {
  const fgRef        = useRef();
  const containerRef = useRef();
  const pulsePhase   = useRef(0);         // drives particle glow only — never touches node opacity
  const zoomedRef    = useRef(false);     // ensure zoom runs exactly once per data load

  // ── Dimensions: read from DOM immediately to avoid 800×600 flash ────────
  const [dims, setDims] = useState(() => ({
    width:  typeof window !== 'undefined' ? window.innerWidth  : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));

  // Use useLayoutEffect so dimensions are correct before first paint
  useLayoutEffect(() => {
    const read = () => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setDims({ width: r.width, height: r.height });
    };
    read();
    const ro = new ResizeObserver(read);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', read);
    return () => { ro.disconnect(); window.removeEventListener('resize', read); };
  }, []);

  // ── Initial zoom: fires once when nodes arrive, tight enough to fill canvas ──
  useEffect(() => {
    if (graphData.nodes.length === 0) { zoomedRef.current = false; return; }
    if (zoomedRef.current) return;
    zoomedRef.current = true;

    // Let simulation pre-settle, then zoom to fill the canvas tightly
    const t = setTimeout(() => {
      if (!fgRef.current) return;
      // padding=20 = maximum zoom (nodes nearly touch edge) — user can zoom out
      fgRef.current.zoomToFit(600, 20);
    }, 900);
    return () => clearTimeout(t);
  }, [graphData.nodes.length]);

  // ── Perpetual RAF: pulses only the particle/link glow, NOT node opacity ──
  useEffect(() => {
    let raf;
    const tick = () => {
      pulsePhase.current = (pulsePhase.current + 0.022) % (Math.PI * 2);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Node painter: full opacity always, glow only for selected/neighbor ───
  const paintNode = useCallback((node, ctx, globalScale) => {
    const isSelected   = highlightNodes.has(node.id) || node.id === selectedNodeId;
    const isNeighbor   = highlightedNeighbors?.has(node.id);
    const isHovered    = false; // handled via hover state below

    const meta   = NODE_TYPE_META[node.type] || { color: '#888', size: 5 };
    const color  = node.color || meta.color;
    const base   = node.size  || meta.size;
    const anyActive = selectedNodeId != null;

    // Scale factor
    const scaleMult = isSelected ? 2.0 : isNeighbor ? 1.5 : 1.0;
    const radius    = base * scaleMult;

    // Dim non-connected nodes when a selection is active — but NEVER change opacity of selected/neighbors
    // Nodes always stay at full opacity themselves; only distant nodes dim slightly
    const nodeAlpha = anyActive && !isSelected && !isNeighbor ? 0.25 : 1.0;

    // Outer glow for selected node
    if (isSelected) {
      const glowR = radius + 8;
      const grd = ctx.createRadialGradient(node.x, node.y, radius, node.x, node.y, glowR);
      grd.addColorStop(0, color + '60');
      grd.addColorStop(1, color + '00');
      ctx.beginPath();
      ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
    }

    // Neighbor ring indicator
    if (isNeighbor) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = color + 'cc';
      ctx.lineWidth   = 1.5 / globalScale;
      ctx.stroke();
    }

    // Main fill — always full opacity for selected/neighbor
    ctx.globalAlpha = nodeAlpha;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? '#ffffff' : color;
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Border on selected/neighbor
    if (isSelected || isNeighbor) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth   = (isSelected ? 2.5 : 1.5) / globalScale;
      ctx.stroke();
    }

    // Label: show when zoomed in enough OR node is active
    if (globalScale >= 1.6 || isSelected || isNeighbor) {
      const raw = node.label || node.id;
      const txt = raw.length > 18 ? raw.slice(0, 17) + '…' : raw;
      const fs  = Math.min(14, Math.max(4, 10 / globalScale));
      ctx.font = `${fs}px DM Sans, sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(txt, node.x + 0.5, node.y + radius + 1.5);
      // text — full opacity for active, dimmed for background
      ctx.fillStyle = anyActive && !isSelected && !isNeighbor
        ? 'rgba(255,255,255,0.2)'
        : 'rgba(255,255,255,0.92)';
      ctx.fillText(txt, node.x, node.y + radius + 1);
    }
  }, [highlightNodes, highlightedNeighbors, selectedNodeId]);

  // ── Link painter: pulsing particles via canvas, directional arrows ───────
  const paintLink = useCallback((link, ctx, globalScale) => {
    const src = link.source;
    const tgt = link.target;
    if (!src?.x || !tgt?.x) return;

    const srcId = typeof src === 'object' ? src.id : src;
    const tgtId = typeof tgt === 'object' ? tgt.id : tgt;

    const anyActive   = selectedNodeId != null;
    const isRelevant  = anyActive && (
      srcId === selectedNodeId || tgtId === selectedNodeId ||
      highlightedNeighbors?.has(srcId) || highlightedNeighbors?.has(tgtId)
    );

    // Pulse drives link glow brightness — NOT node opacity
    const pulse   = 0.5 + 0.5 * Math.sin(pulsePhase.current * 0.8);
    const lineAlpha = anyActive
      ? (isRelevant ? 0.65 + 0.25 * pulse : 0.03)
      : 0.12 + 0.08 * pulse;             // ambient pulse on all links when idle

    // Draw line
    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.lineTo(tgt.x, tgt.y);
    ctx.strokeStyle = isRelevant
      ? `rgba(127,119,221,${lineAlpha})`
      : `rgba(100,130,200,${lineAlpha})`;
    ctx.lineWidth = isRelevant ? 1.8 / globalScale : 0.6 / globalScale;
    ctx.stroke();

    // Directional arrowhead — only on relevant links when a node is selected
    if (isRelevant) {
      const dx  = tgt.x - src.x;
      const dy  = tgt.y - src.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 2) return;

      const ux  = dx / len;
      const uy  = dy / len;
      const tgtR = ((NODE_TYPE_META[typeof tgt === 'object' ? tgt.type : 'customer']?.size) || 5) * 1.2;
      // Arrow tip position — just outside target node boundary
      const ax  = tgt.x - ux * (tgtR + 5 / globalScale);
      const ay  = tgt.y - uy * (tgtR + 5 / globalScale);
      const al  = 8 / globalScale;  // arrow length
      const aw  = 4 / globalScale;  // arrow wing width

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - ux * al + uy * aw, ay - uy * al - ux * aw);
      ctx.lineTo(ax - ux * al - uy * aw, ay - uy * al + ux * aw);
      ctx.closePath();
      ctx.fillStyle = `rgba(127,119,221,${0.75 + 0.25 * pulse})`;
      ctx.fill();
    }
  }, [highlightNodes, highlightedNeighbors, selectedNodeId]);

  // ── Hover tooltip state ───────────────────────────────────────────────────
  const [hoveredNode, setHoveredNode]   = useState(null);
  const [tooltipPos,  setTooltipPos]    = useState({ x: 0, y: 0 });
  const handleNodeHover = useCallback((node) => setHoveredNode(node ?? null), []);

  useEffect(() => {
    const fn = (e) => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      setTooltipPos({ x: e.clientX - r.left + 14, y: e.clientY - r.top - 18 });
    };
    window.addEventListener('mousemove', fn);
    return () => window.removeEventListener('mousemove', fn);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
      <div className="spinner" />
      <span style={{ color:'rgba(255,255,255,0.45)', fontFamily:'DM Sans', fontSize:13 }}>Building graph…</span>
    </div>
  );

  if (error) return (
    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
      <span style={{ color:'#D85A30', fontSize:13, fontFamily:'DM Sans' }}>⚠ {error}</span>
      <button onClick={onRefresh} style={{ padding:'6px 16px', background:'#7F77DD22', border:'1px solid #7F77DD66', borderRadius:6, color:'#AFA9EC', cursor:'pointer', fontFamily:'DM Sans', fontSize:12 }}>Retry</button>
    </div>
  );

  return (
    <div ref={containerRef} style={{ position:'absolute', inset:0, overflow:'hidden' }}>
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dims.width}
        height={dims.height}
        backgroundColor="transparent"
        /* custom renderers */
        nodeCanvasObject={paintNode}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={paintLink}
        linkCanvasObjectMode={() => 'replace'}
        /* flowing particles — perpetual data-flow pulse effect */
        linkDirectionalParticles={3}
        linkDirectionalParticleWidth={link => {
          const srcId = typeof link.source === 'object' ? link.source.id : link.source;
          const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
          const rel = selectedNodeId && (
            srcId === selectedNodeId || tgtId === selectedNodeId ||
            highlightedNeighbors?.has(srcId) || highlightedNeighbors?.has(tgtId)
          );
          return rel ? 3 : 1.5;
        }}
        linkDirectionalParticleSpeed={0.003}
        linkDirectionalParticleColor={link => {
          const srcId = typeof link.source === 'object' ? link.source.id : link.source;
          const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
          const rel = selectedNodeId && (
            srcId === selectedNodeId || tgtId === selectedNodeId ||
            highlightedNeighbors?.has(srcId) || highlightedNeighbors?.has(tgtId)
          );
          return rel ? 'rgba(127,119,221,0.9)' : 'rgba(100,140,220,0.35)';
        }}
        /* interaction */
        onNodeClick={onNodeClick}
        onNodeHover={handleNodeHover}
        enableNodeDrag
        /* simulation tuning */
        warmupTicks={100}
        cooldownTicks={300}
        cooldownTime={12000}
        d3AlphaDecay={0.006}
        d3VelocityDecay={0.3}
        linkCurvature={0.06}
      />

      {/* Hover tooltip */}
      {hoveredNode && (
        <div style={{
          position:'absolute', left:tooltipPos.x, top:tooltipPos.y, pointerEvents:'none',
          background:'rgba(8,8,22,0.97)', border:`1px solid ${hoveredNode.color || '#7F77DD'}44`,
          borderRadius:9, padding:'9px 13px', zIndex:120, maxWidth:240,
          boxShadow:'0 4px 24px rgba(0,0,0,0.6)',
        }}>
          <div style={{ color: hoveredNode.color || '#7F77DD', fontSize:10, fontFamily:'DM Sans', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>
            {NODE_TYPE_META[hoveredNode.type]?.label || hoveredNode.type}
          </div>
          <div style={{ color:'#fff', fontSize:12, fontFamily:'DM Mono', wordBreak:'break-all', lineHeight:1.4 }}>
            {hoveredNode.id}
          </div>
          {hoveredNode.data?.net_amount && (
            <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, fontFamily:'DM Sans', marginTop:4 }}>
              {hoveredNode.data.currency || 'INR'} {Number(hoveredNode.data.net_amount).toLocaleString()}
            </div>
          )}
          <div style={{ color:'rgba(255,255,255,0.22)', fontSize:10, fontFamily:'DM Sans', marginTop:6, borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:5 }}>
            Click to inspect · see neighbors
          </div>
        </div>
      )}

      {/* Legend — 2-col grid, all 10 types */}
      <div style={{
        position:'absolute', bottom:16, left:16, zIndex:50,
        background:'rgba(5,5,18,0.85)', backdropFilter:'blur(12px)',
        border:'1px solid rgba(255,255,255,0.07)', borderRadius:11,
        padding:'10px 14px',
        display:'grid', gridTemplateColumns:'1fr 1fr', gap:'5px 20px',
      }}>
        {Object.entries(NODE_TYPE_META).map(([type, meta]) => (
          <div key={type} style={{ display:'flex', alignItems:'center', gap:7 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:meta.color, flexShrink:0, boxShadow:`0 0 5px ${meta.color}99` }} />
            <span style={{ color:'rgba(255,255,255,0.5)', fontSize:10.5, fontFamily:'DM Sans', whiteSpace:'nowrap' }}>{meta.label}</span>
          </div>
        ))}
        <div style={{ gridColumn:'1/-1', borderTop:'1px solid rgba(255,255,255,0.05)', marginTop:3, paddingTop:5, color:'rgba(255,255,255,0.2)', fontSize:9.5, fontFamily:'DM Sans' }}>
          {graphData.nodes.length} nodes · {graphData.links.length} edges
        </div>
      </div>

      {/* Zoom controls */}
      <div style={{ position:'absolute', top:16, right:16, display:'flex', flexDirection:'column', gap:4, zIndex:50 }}>
        {[
          { label:'+', fn: () => fgRef.current?.zoom((fgRef.current.zoom() ?? 1) * 1.3, 200) },
          { label:'−', fn: () => fgRef.current?.zoom((fgRef.current.zoom() ?? 1) * 0.75, 200) },
          { label:'⊕', fn: () => fgRef.current?.zoomToFit(400, 20) },
        ].map(b => (
          <button key={b.label} onClick={b.fn} style={{
            width:28, height:28, background:'rgba(5,5,18,0.8)',
            border:'1px solid rgba(255,255,255,0.09)', borderRadius:7,
            color:'rgba(255,255,255,0.55)', cursor:'pointer', fontSize:14,
            display:'flex', alignItems:'center', justifyContent:'center',
            backdropFilter:'blur(8px)', transition:'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(127,119,221,0.25)'; e.currentTarget.style.color='#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background='rgba(5,5,18,0.8)'; e.currentTarget.style.color='rgba(255,255,255,0.55)'; }}
          >{b.label}</button>
        ))}
      </div>
    </div>
  );
}
