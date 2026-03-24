import { useState, useCallback } from 'react';
import { sendChat, fetchSuggestions } from '../api/index.js';

export function useChat(onHighlightNodes) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hi! I can help you analyze the **Order to Cash** process. Ask me about sales orders, deliveries, billing documents, payments, or any part of the ERP flow.",
      timestamp: new Date(),
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const loadSuggestions = useCallback(async () => {
    try {
      const data = await fetchSuggestions();
      setSuggestions(data);
    } catch { /* silent */ }
  }, []);

  const sendMessage = useCallback(async (userMessage) => {
    if (!userMessage.trim() || loading) return;

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // Build history for context (last 6 exchanges)
      const history = messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const data = await sendChat(userMessage, history);

      // Extract any IDs from rows to highlight on graph
      if (data.rows?.length > 0 && onHighlightNodes) {
        const ids = data.rows.slice(0, 20).map(r => r.id || r.billing_document_id || r.order_id).filter(Boolean);
        if (ids.length > 0) onHighlightNodes(ids);
      }

      const assistantMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer,
        sql: data.sql,
        rows: data.rows,
        rowCount: data.rowCount,
        blocked: data.blocked,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${err.response?.data?.error || err.message}`,
        isError: true,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, onHighlightNodes]);

  return { messages, loading, sendMessage, suggestions, loadSuggestions };
}
