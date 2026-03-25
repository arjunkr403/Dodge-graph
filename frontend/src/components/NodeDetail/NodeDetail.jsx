import { useState } from 'react';

const ENTITY_COLORS = {
  customer: '#1D9E75', product: '#5DCAA5',
  sales_order: '#7F77DD', sales_order_item: '#AFA9EC',
  delivery: '#D85A30', delivery_item: '#F0997B',
  billing_document: '#E8593C', billing_item: '#F5B8A8',
  journal_entry: '#BA7517', payment: '#EF9F27',
};

const FIELD_LABELS = {
  id:'ID', type:'Entity Type', net_amount:'Net Amount', total_net_value:'Net Value',
  amount_in_transaction_currency:'Amount', amount:'Amount', currency:'Currency',
  transaction_currency:'Currency', billing_date:'Billing Date', order_date:'Order Date',
  posting_date:'Posting Date', actual_delivery_date:'Delivery Date', payment_date:'Payment Date',
  billing_type:'Billing Type', accounting_document_type:'Doc Type', gl_account:'GL Account',
  company_code:'Company Code', fiscal_year:'Fiscal Year', plant:'Plant',
  quantity:'Quantity', delivered_quantity:'Del. Quantity', customer_id:'Customer',
  order_id:'Sales Order', delivery_id:'Delivery', billing_doc_id:'Billing Doc',
  product_id:'Product', reference_document:'Reference Doc', overall_status:'Status',
  status:'Status', country:'Country', region:'Region', name:'Name',
  description:'Description', category:'Category', profit_center:'Profit Center',
  shipping_point:'Shipping Point', accounting_document:'Accounting Doc',
};

const SKIP = new Set(['color','size','x','y','vx','vy','fx','fy','index','__indexColor','data','label']);

function fmt(key, val) {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'number') {
    if (key.includes('amount') || key.includes('value')) {
      return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return val.toLocaleString();
  }
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    try { return new Date(val).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); }
    catch { return val; }
  }
  return String(val);
}

export default function NodeDetail({ node, graphData, onClose, onExpand }) {
  const [expanding, setExpanding] = useState(false);
  const [expanded, setExpanded]   = useState(false);

  if (!node) return null;

  const color       = ENTITY_COLORS[node.type] || '#888';
  const entityLabel = (node.type || 'Entity').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // Count actual connected edges in graph
  const connectionCount = graphData?.links?.filter(l => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    return s === node.id || t === node.id;
  }).length ?? 0;

  const allFields = { ...node, ...(node.data || {}) };
  const rows = Object.entries(allFields)
    .filter(([k, v]) => !SKIP.has(k) && k !== 'data' && v !== null && v !== undefined && v !== '')
    .slice(0, 22);

  const handleExpand = async () => {
    setExpanding(true);
    try {
      await onExpand(node.id, node.type);
      setExpanded(true);
    } finally {
      setExpanding(false);
    }
  };

  return (
    <div style={{
      position:'absolute', top:0, right:0, bottom:0, width:300,
      background:'rgba(6,6,20,0.97)', backdropFilter:'blur(20px)',
      borderLeft:`1px solid ${color}30`,
      display:'flex', flexDirection:'column',
      fontFamily:'DM Sans, sans-serif', zIndex:60,
      animation:'slideIn 0.18s ease-out',
    }}>
      {/* Header */}
      <div style={{ padding:'16px 18px 14px', borderBottom:`1px solid ${color}18`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{
            display:'inline-flex', alignItems:'center', gap:6,
            background:color+'14', border:`1px solid ${color}35`,
            borderRadius:20, padding:'3px 10px',
          }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:color, boxShadow:`0 0 4px ${color}` }} />
            <span style={{ color, fontSize:10.5, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase' }}>
              {entityLabel}
            </span>
          </div>
          <button onClick={onClose} style={{
            background:'none', border:'none', color:'rgba(255,255,255,0.3)',
            cursor:'pointer', fontSize:20, padding:'0 0 0 8px', lineHeight:1,
            transition:'color 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.color='rgba(255,255,255,0.8)'}
            onMouseLeave={e => e.currentTarget.style.color='rgba(255,255,255,0.3)'}
          >×</button>
        </div>
        <div style={{ color:'#fff', fontSize:12.5, fontFamily:'DM Mono', wordBreak:'break-all', lineHeight:1.45 }}>
          {node.id}
        </div>
        {connectionCount > 0 && (
          <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:4, height:4, borderRadius:'50%', background:color }} />
            <span style={{ color:'rgba(255,255,255,0.35)', fontSize:10.5 }}>
              {connectionCount} connection{connectionCount !== 1 ? 's' : ''} in graph
            </span>
          </div>
        )}
      </div>

      {/* Fields */}
      <div style={{ flex:1, overflowY:'auto', padding:'10px 18px' }}>
        {rows.map(([key, val]) => (
          <div key={key} style={{
            display:'flex', justifyContent:'space-between', alignItems:'flex-start',
            padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,0.035)', gap:12,
          }}>
            <span style={{ color:'rgba(255,255,255,0.3)', fontSize:10.5, flexShrink:0, paddingTop:1, minWidth:80 }}>
              {FIELD_LABELS[key] || key.replace(/_/g,' ')}
            </span>
            <span style={{ color:'rgba(255,255,255,0.8)', fontSize:11.5, fontFamily:'DM Mono', textAlign:'right', wordBreak:'break-all' }}>
              {fmt(key, val)}
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <div style={{ color:'rgba(255,255,255,0.2)', fontSize:12, padding:'20px 0', textAlign:'center' }}>
            No metadata available
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding:'12px 18px', borderTop:`1px solid ${color}18`, flexShrink:0, display:'flex', gap:8 }}>
        <button
          onClick={handleExpand}
          disabled={expanding}
          style={{
            flex:1, padding:'9px 0',
            background: expanded ? color+'25' : color+'14',
            border:`1px solid ${color}${expanded ? '55' : '35'}`,
            borderRadius:8, color, cursor: expanding ? 'wait' : 'pointer',
            fontSize:12, fontFamily:'DM Sans', fontWeight:500,
            transition:'all 0.15s', opacity: expanding ? 0.7 : 1,
          }}
          onMouseEnter={e => !expanding && (e.currentTarget.style.background = color+'28')}
          onMouseLeave={e => !expanding && (e.currentTarget.style.background = expanded ? color+'25' : color+'14')}
        >
          {expanding ? 'Loading…' : expanded ? '✓ Neighbors Loaded' : 'Expand Neighbors'}
        </button>
      </div>
    </div>
  );
}
