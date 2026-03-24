const FIELD_LABELS = {
  id: 'ID', type: 'Entity Type', label: 'Label',
  customer_id: 'Customer', order_id: 'Sales Order', delivery_id: 'Delivery',
  billing_doc_id: 'Billing Doc', product_id: 'Product',
  net_amount: 'Net Amount', total_net_value: 'Net Value',
  amount_in_transaction_currency: 'Amount', amount: 'Amount',
  currency: 'Currency', transaction_currency: 'Currency',
  order_date: 'Order Date', billing_date: 'Billing Date',
  posting_date: 'Posting Date', actual_delivery_date: 'Delivery Date',
  payment_date: 'Payment Date', status: 'Status', overall_status: 'Status',
  billing_type: 'Billing Type', accounting_document_type: 'Doc Type',
  gl_account: 'GL Account', company_code: 'Company Code',
  fiscal_year: 'Fiscal Year', plant: 'Plant',
  quantity: 'Quantity', delivered_quantity: 'Del. Quantity',
  country: 'Country', region: 'Region', name: 'Name',
  description: 'Description', category: 'Category',
  reference_document: 'Reference Doc',
};

const ENTITY_COLORS = {
  customer: '#1D9E75', product: '#1D9E75',
  sales_order: '#7F77DD', sales_order_item: '#AFA9EC',
  delivery: '#D85A30', delivery_item: '#F0997B',
  billing_document: '#D85A30', billing_item: '#F0997B',
  journal_entry: '#BA7517', payment: '#EF9F27',
};

const SKIP_FIELDS = new Set(['color', 'size', 'x', 'y', 'vx', 'vy', 'fx', 'fy', 'index', '__indexColor', 'data']);

function formatValue(key, val) {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'number') {
    if (key.includes('amount') || key.includes('value') || key === 'amount') {
      return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return val.toLocaleString();
  }
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
    return new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return String(val);
}

export default function NodeDetail({ node, onClose, onExpand }) {
  if (!node) return null;

  const color = ENTITY_COLORS[node.type] || '#888';
  const entityLabel = node.type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Entity';

  // Merge top-level fields and data object
  const allFields = { ...node, ...(node.data || {}) };

  const rows = Object.entries(allFields)
    .filter(([k, v]) => !SKIP_FIELDS.has(k) && v !== null && v !== undefined && v !== '')
    .filter(([k]) => k !== 'data')
    .slice(0, 20);

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: 300,
      background: 'rgba(8, 8, 18, 0.96)',
      backdropFilter: 'blur(16px)',
      borderLeft: `1px solid ${color}33`,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'DM Sans, sans-serif',
      zIndex: 50,
      animation: 'slideIn 0.18s ease-out',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 18px 14px',
        borderBottom: `1px solid ${color}22`,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: color + '18', border: `1px solid ${color}44`,
            borderRadius: 20, padding: '3px 10px', marginBottom: 8,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
            <span style={{ color, fontSize: 11, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {entityLabel}
            </span>
          </div>
          <div style={{ color: '#fff', fontSize: 13, fontFamily: 'DM Mono', wordBreak: 'break-all', lineHeight: 1.4 }}>
            {node.id}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: 18, padding: '0 0 0 8px', lineHeight: 1 }}
        >×</button>
      </div>

      {/* Fields */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 18px' }}>
        {rows.map(([key, val]) => (
          <div key={key} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            padding: '7px 0',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            gap: 12,
          }}>
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, flexShrink: 0, paddingTop: 1 }}>
              {FIELD_LABELS[key] || key}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, fontFamily: 'DM Mono', textAlign: 'right', wordBreak: 'break-all' }}>
              {formatValue(key, val)}
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
            No additional metadata
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: '12px 18px', borderTop: `1px solid ${color}22`, display: 'flex', gap: 8 }}>
        <button
          onClick={() => onExpand(node.id, node.type)}
          style={{
            flex: 1, padding: '8px 0',
            background: color + '18', border: `1px solid ${color}44`,
            borderRadius: 7, color, cursor: 'pointer',
            fontSize: 12, fontFamily: 'DM Sans', fontWeight: 500,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.target.style.background = color + '30'}
          onMouseLeave={e => e.target.style.background = color + '18'}
        >
          Expand Neighbors
        </button>
      </div>
    </div>
  );
}
