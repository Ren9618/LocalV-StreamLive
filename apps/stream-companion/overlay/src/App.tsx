import { useState, useEffect } from 'react';
import './App.css';

interface Comment {
  id: number;
  user: string;
  text: string;
  aiReply?: string;
}

function App() {
  const [comments, setComments] = useState<Comment[]>([]);

  useEffect(() => {
    // WebSocket接続
    const ws = new WebSocket('ws://localhost:8080');

    ws.onopen = () => {
      console.log('✅ Connected to Bot Server');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'comment') {
        // 新しいコメント追加
        setComments(prev => [...prev, {
          id: data.id,
          user: data.user,
          text: data.text,
          aiReply: data.aiReply
        }].slice(-5));
      } else if (data.type === 'update_reply') {
        // AIの返答を更新
        setComments(prev => prev.map(c => 
          c.id === data.id ? { ...c, aiReply: data.aiReply } : c
        ));
      } else if (data.type === 'audio') {
        // 音声データを再生
        try {
          const audioSrc = `data:audio/wav;base64,${data.audioData}`;
          const audio = new Audio(audioSrc);
          audio.play().catch(e => console.error("Audio Play Error:", e));
        } catch (e) {
          console.error("Audio Setup Error:", e);
        }
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div className="overlay-container">
      {comments.map((c) => (
        <div key={c.id} className="comment-box">
          <div className="user-section">
            <span className="user-name">{c.user}</span>
            <span className="user-text">{c.text}</span>
          </div>
          <div className="ai-section">
            <span className="ai-icon">🤖</span>
            <span className="ai-text">{c.aiReply}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default App;
