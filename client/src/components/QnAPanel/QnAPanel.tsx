import React, { useState, useEffect } from 'react';
import styles from './QnAPanel.module.css';

interface SettlementOption {
  settlementId: string;
  status: string;
}

export function QnAPanel() {
  const [settlementId, setSettlementId] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<SettlementOption[]>([]);

  useEffect(() => {
    fetch("http://localhost:3001/api/qna/settlements")
      .then(res => res.json())
      .then(data => {
        if (data.settlements) {
          setOptions(data.settlements);
          if (data.settlements.length > 0) {
            setSettlementId(data.settlements[0].settlementId);
          }
        }
      })
      .catch(err => console.error("Failed to load settlements:", err));
  }, []);

  const ask = async () => {
    if (!question.trim() || !settlementId.trim()) return;
    setLoading(true);
    setAnswer("");
    try {
      const res = await fetch("http://localhost:3001/api/qna/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settlementId, question })
      });
      const data = await res.json();
      setAnswer(data.answer || data.error);
    } catch (err) {
      setAnswer(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.panel}>
      <h4>Ask AI about a Settlement</h4>
      <div className={styles.inputGroup}>
        <select 
          value={settlementId} 
          onChange={e => setSettlementId(e.target.value)} 
          className={styles.input}
        >
          {options.map(opt => (
            <option key={opt.settlementId} value={opt.settlementId}>
              {opt.settlementId} ({opt.status})
            </option>
          ))}
        </select>
        <input 
          type="text" 
          value={question} 
          onChange={e => setQuestion(e.target.value)} 
          placeholder="Why was there a fee discrepancy?" 
          className={styles.input}
          onKeyDown={e => e.key === 'Enter' && ask()}
        />
        <button onClick={ask} disabled={loading || !settlementId || !question} className={styles.button}>
          {loading ? "Thinking..." : "Ask"}
        </button>
      </div>
      {answer && (
        <div className={styles.answerBox}>
          <strong>AI:</strong> {answer}
        </div>
      )}
    </div>
  );
}
