import { useState, useCallback } from 'react';
import GraphCanvas from './components/GraphCanvas/GraphCanvas.jsx';
import ChatPanel from './components/ChatPanel/ChatPanel.jsx';
import NodeDetail from './components/NodeDetail/NodeDetail.jsx';
import { useGraph } from './hooks/useGraph.js';
import { useChat } from './hooks/useChat.js';

export default function App() {
  const [selectedNode,         setSelectedNode]  = useState(null);
  const [highlightedNeighbors, setNeighbors]     = useState(new Set());
  const [chatMinimized,        setChatMinimized] = useState(false);

  const {
    graphData, loading: graphLoading, error: graphError,
    meta, loadGraph, expandNode, highlightNodes, highlightByIds,
  } = useGraph();

  const { messages, loading: chatLoading, sendMessage } = useChat(highlightByIds);

  // Extract neighbor IDs from current (post-simulation) graph links
  // After force-graph processes data, link.source/.target become objects {id, x, y, ...}
  const getNeighborIds = useCallback((nodeId) => {
    const s = new Set();
    graphData.links.forEach(link => {
      const srcId = typeof link.source === 'object' ? link.source.id : link.source;
      const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
      if (srcId === nodeId) s.add(tgtId);
      if (tgtId === nodeId) s.add(srcId);
    });
    return s;
  }, [graphData.links]);

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node);
    setNeighbors(getNeighborIds(node.id));
  }, [getNeighborIds]);

  const handleExpand = useCallback(async (nodeId, nodeType) => {
    await expandNode(nodeId, nodeType);
    // After new nodes/links merge in, recompute neighbors for the selected node
    setTimeout(() => setNeighbors(getNeighborIds(nodeId)), 350);
  }, [expandNode, getNeighborIds]);

  const handleClose = useCallback(() => {
    setSelectedNode(null);
    setNeighbors(new Set());
  }, []);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #060610; color: #fff; font-family: 'DM Sans', sans-serif; overflow: hidden; height: 100vh; }
        #root { height: 100vh; display: flex; flex-direction: column; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { width:32px; height:32px; border:2px solid rgba(127,119,221,0.15); border-top-color:#7F77DD; border-radius:50%; animation:spin 0.8s linear infinite; }
        button:focus-visible { outline: 2px solid rgba(127,119,221,0.5); outline-offset: 2px; }
        @keyframes slideIn { from{transform:translateX(20px);opacity:0} to{transform:translateX(0);opacity:1} }
      `}</style>

      {/* Top bar */}
      <div style={{
        height:48, display:'flex', alignItems:'center', padding:'0 20px', gap:8,
        borderBottom:'1px solid rgba(255,255,255,0.06)',
        background:'rgba(6,6,16,0.98)', backdropFilter:'blur(10px)',
        zIndex:100, flexShrink:0,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{
            width:22, height:22, borderRadius:5,
            background:'linear-gradient(135deg, #7F77DD, #1D9E75)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:12, fontWeight:700, color:'#fff',
          }}>D</div>
          <span style={{ color:'rgba(255,255,255,0.3)', fontSize:13 }}>Mapping</span>
          <span style={{ color:'rgba(255,255,255,0.15)', fontSize:13 }}>/</span>
          <span style={{ color:'rgba(255,255,255,0.85)', fontSize:13, fontWeight:500 }}>Order to Cash</span>
        </div>
        <div style={{ flex:1 }} />
        {meta && (
          <div style={{ display:'flex', gap:16, alignItems:'center' }}>
            <StatBadge label="Nodes" value={meta.nodeCount?.toLocaleString()} color="#7F77DD" />
            <StatBadge label="Edges" value={meta.linkCount?.toLocaleString()} color="#1D9E75" />
          </div>
        )}
        <div style={{ width:1, height:20, background:'rgba(255,255,255,0.08)', margin:'0 4px' }} />
        <button onClick={loadGraph} style={{
          background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)',
          borderRadius:7, padding:'5px 12px', color:'rgba(255,255,255,0.5)',
          fontSize:12, cursor:'pointer', fontFamily:'DM Sans', transition:'all 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.color='#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='rgba(255,255,255,0.5)'; }}
        >↻ Refresh</button>
      </div>

      {/* Main */}
      <div style={{ flex:1, display:'flex', overflow:'hidden', position:'relative' }}>

        {/* Graph area */}
        <div style={{ flex:1, position:'relative', overflow:'hidden', minWidth:0 }}>
          <GraphCanvas
            graphData={graphData}
            loading={graphLoading}
            error={graphError}
            onNodeClick={handleNodeClick}
            highlightNodes={highlightNodes}
            highlightedNeighbors={highlightedNeighbors}
            selectedNodeId={selectedNode?.id ?? null}
            onRefresh={loadGraph}
          />

          {selectedNode && (
            <NodeDetail
              node={selectedNode}
              graphData={graphData}
              onClose={handleClose}
              onExpand={handleExpand}
            />
          )}
        </div>

        {/* Chat */}
        <div style={{
          width: chatMinimized ? 0 : 340, flexShrink:0,
          transition:'width 0.2s ease', overflow:'hidden', position:'relative',
        }}>
          <ChatPanel
            messages={messages}
            loading={chatLoading}
            onSend={sendMessage}
            onToggleMinimize={() => setChatMinimized(o => !o)}
          />
        </div>

        {chatMinimized && (
          <button onClick={() => setChatMinimized(false)} style={{
            position:'absolute', bottom:20, right:20,
            width:52, height:52, borderRadius:'50%',
            background:'linear-gradient(135deg, #7F77DD, #1D9E75)',
            border:'none', cursor:'pointer', fontSize:20,
            boxShadow:'0 4px 20px rgba(127,119,221,0.4)', zIndex:200,
          }}>💬</button>
        )}
      </div>
    </>
  );
}

function StatBadge({ label, value, color }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div style={{ width:5, height:5, borderRadius:'50%', background:color }} />
      <span style={{ color:'rgba(255,255,255,0.3)', fontSize:11 }}>{label}</span>
      <span style={{ color:'rgba(255,255,255,0.7)', fontSize:12, fontFamily:'DM Mono' }}>{value}</span>
    </div>
  );
}
