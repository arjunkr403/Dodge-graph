import { useState, useRef, useEffect } from 'react';

// Prewritten queries shown as chips — always visible on first load
const PREWRITTEN_QUERIES = [
  "Which billing documents have the highest net amount?",
  "Trace the full flow of billing document 90504248",
  "Show deliveries with no billing document",
  "What is the total billed amount per customer?",
  "Which products appear in the most billing items?",
  "Show all journal entries posted in April 2025",
  "List all customers with their total payment amount",
  "Show payments received for customer 320000083",
  "Find billing documents without a journal entry",
  "What is the average billing amount across all documents?",
  "Show top 5 products by total billed quantity",
  "Which company codes are present in the dataset?",
];

function formatMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

function SqlBlock({ sql }) {
  const [open, setOpen] = useState(false);
  if (!sql) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: '1px solid rgba(127,119,221,0.25)',
          borderRadius: 5, padding: '3px 10px', color: 'rgba(127,119,221,0.7)',
          cursor: 'pointer', fontSize: 11, fontFamily: 'DM Sans',
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        <span style={{ fontSize: 9 }}>{open ? '▼' : '▶'}</span>
        {open ? 'Hide SQL' : 'View generated SQL'}
      </button>
      {open && (
        <pre style={{
          marginTop: 8, padding: '10px 12px',
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(127,119,221,0.15)',
          borderRadius: 7, fontSize: 11,
          fontFamily: 'DM Mono', color: '#AFA9EC',
          overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          lineHeight: 1.6,
        }}>
          {sql}
        </pre>
      )}
    </div>
  );
}

function DataTable({ rows, rowCount }) {
  const [open, setOpen] = useState(false);
  if (!rows || rows.length === 0) return null;
  const cols = Object.keys(rows[0]).slice(0, 6);
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: '1px solid rgba(29,158,117,0.25)',
          borderRadius: 5, padding: '3px 10px', color: 'rgba(29,158,117,0.7)',
          cursor: 'pointer', fontSize: 11, fontFamily: 'DM Sans',
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        <span style={{ fontSize: 9 }}>{open ? '▼' : '▶'}</span>
        {open ? 'Hide' : 'View'} {rowCount} row{rowCount !== 1 ? 's' : ''}
      </button>
      {open && (
        <div style={{ marginTop: 8, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'DM Mono' }}>
            <thead>
              <tr>
                {cols.map(c => (
                  <th key={c} style={{
                    padding: '5px 8px', textAlign: 'left',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.4)', fontWeight: 500, whiteSpace: 'nowrap',
                  }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 15).map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  {cols.map(c => (
                    <td key={c} style={{
                      padding: '4px 8px', color: 'rgba(255,255,255,0.65)',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {row[c] === null ? '—' : String(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rowCount > 15 && (
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, padding: '4px 8px', fontFamily: 'DM Sans' }}>
              Showing 15 of {rowCount} rows
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{
      display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 14, padding: '0 4px',
    }}>
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'linear-gradient(135deg, #7F77DD, #1D9E75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, flexShrink: 0, marginRight: 10, marginTop: 2,
          fontWeight: 600, color: '#fff',
        }}>D</div>
      )}
      <div style={{ maxWidth: '85%' }}>
        <div style={{
          padding: '10px 14px',
          background: isUser
            ? 'linear-gradient(135deg, #7F77DD22, #7F77DD33)'
            : 'rgba(255,255,255,0.04)',
          border: `1px solid ${isUser ? 'rgba(127,119,221,0.3)' : 'rgba(255,255,255,0.06)'}`,
          borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          color: msg.isError ? '#D85A30' : 'rgba(255,255,255,0.85)',
          fontSize: 13, fontFamily: 'DM Sans', lineHeight: 1.6,
        }}
          dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
        />
        {msg.sql && <SqlBlock sql={msg.sql} />}
        {msg.rows && <DataTable rows={msg.rows} rowCount={msg.rowCount} />}
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 4, fontFamily: 'DM Sans', textAlign: isUser ? 'right' : 'left' }}>
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px', marginBottom: 14 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'linear-gradient(135deg, #7F77DD, #1D9E75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, flexShrink: 0, fontWeight: 600, color: '#fff',
      }}>D</div>
      <div style={{
        padding: '10px 16px', background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '14px 14px 14px 4px',
        display: 'flex', gap: 5, alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'rgba(127,119,221,0.6)',
            animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

// Prewritten query chips — always visible before first message
function QueryChips({ onSelect }) {
  return (
    <div style={{ padding: '8px 12px 0' }}>
      <div style={{
        fontSize: 10, color: 'rgba(255,255,255,0.25)',
        letterSpacing: '0.08em', marginBottom: 8,
        fontFamily: 'DM Sans', textTransform: 'uppercase',
      }}>
        Try asking
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {PREWRITTEN_QUERIES.map((q, i) => (
          <button
            key={i}
            onClick={() => onSelect(q)}
            style={{
              background: 'rgba(127,119,221,0.06)',
              border: '1px solid rgba(127,119,221,0.15)',
              borderRadius: 8,
              padding: '7px 11px',
              color: 'rgba(255,255,255,0.6)',
              fontSize: 12,
              fontFamily: 'DM Sans',
              textAlign: 'left',
              cursor: 'pointer',
              lineHeight: 1.4,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(127,119,221,0.14)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
              e.currentTarget.style.borderColor = 'rgba(127,119,221,0.35)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(127,119,221,0.06)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
              e.currentTarget.style.borderColor = 'rgba(127,119,221,0.15)';
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ChatPanel({ messages, loading, onSend, onToggleMinimize }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  // Show chips until user sends first message
  const hasUserMessage = messages.some(m => m.role === 'user');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSubmit = () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput('');
    onSend(msg);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  // Send immediately on chip click — no need to fill input first
  const handleChipClick = (query) => {
    if (loading) return;
    onSend(query);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', background: 'rgba(8,8,18,0.97)',
      borderLeft: '1px solid rgba(255,255,255,0.06)',
      fontFamily: 'DM Sans, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginBottom: 2, letterSpacing: '0.05em' }}>CHAT WITH GRAPH</div>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>Order to Cash</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#1D9E75', boxShadow: '0 0 6px #1D9E75' }} />
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>Live</span>
          </div>
          <button
            onClick={onToggleMinimize}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 18, padding: 2, lineHeight: 1 }}
            title="Minimize"
          >⊖</button>
        </div>
      </div>

      {/* Messages + Chips area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 12px 0' }}>
        {messages.map(msg => <Message key={msg.id} msg={msg} />)}
        {loading && <TypingIndicator />}
        <div ref={messagesEndRef} />

        {/* Show prewritten chips when no user messages yet */}
        {!hasUserMessage && !loading && <QueryChips onSelect={handleChipClick} />}
      </div>

      {/* Input */}
      <div style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-end',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, padding: '8px 10px',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Analyze anything..."
            rows={1}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: 'DM Sans',
              resize: 'none', lineHeight: 1.5, padding: 0,
              overflowY: 'hidden',
            }}
            onInput={e => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px';
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={loading || !input.trim()}
            style={{
              background: input.trim() && !loading ? 'linear-gradient(135deg, #7F77DD, #534AB7)' : 'rgba(255,255,255,0.06)',
              border: 'none', borderRadius: 7, width: 30, height: 30,
              color: input.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.2)',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'all 0.15s',
            }}
          >↑</button>
        </div>
      </div>
    </div>
  );
}
