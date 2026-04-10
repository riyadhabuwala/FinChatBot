import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import MessageBubble from '../components/chat/MessageBubble';
import { marked } from 'marked';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const SharePage = () => {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/share/${slug}`);
        const result = await res.json();
        
        if (!res.ok) throw new Error(result.error || 'Failed to load shared content');
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0F6E56]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg border border-red-100 max-w-md w-full text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Link Unavailable</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link to="/" className="inline-block bg-[#0F6E56] text-white px-6 py-2 rounded-lg font-medium hover:bg-[#0B4F3E]">
            Go to FinChatBot
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm px-6 py-4 flex justify-between items-center z-10 sticky top-0">
        <div className="flex items-center gap-4">
          <div className="font-bold text-xl text-[#0F6E56]">FinChatBot</div>
          <div className="h-4 w-[1px] bg-gray-300"></div>
          <div className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            Shared {data?.linkType === 'conversation' ? 'Conversation' : data?.linkType === 'agent_run' ? 'Agent Report' : 'Insights'}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex text-xs text-gray-400 gap-4">
            <span>Views: {data?.viewCount}</span>
            <span>Created: {new Date(data?.createdAt).toLocaleDateString()}</span>
          </div>
          <Link to="/" className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 transition">
            Open App
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">{data?.title || 'Shared Document'}</h1>
            {data?.expiresAt && (
              <div className="text-sm text-yellow-600 bg-yellow-50 inline-block px-3 py-1 rounded-lg border border-yellow-100 mb-4">
                Expires on {new Date(data.expiresAt).toLocaleDateString()}
              </div>
            )}
          </div>

          {/* Render Conversation */}
          {data?.linkType === 'conversation' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 sm:p-6 space-y-6">
              {data.content?.map((msg, idx) => (
                <MessageBubble key={idx} message={{...msg, timestamp: Date.now()}} />
              ))}
            </div>
          )}

          {/* Render Agent Run */}
          {data?.linkType === 'agent_run' && data.content && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
              <div className="mb-8">
                <div className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Goal</div>
                <div className="text-xl text-gray-800 font-medium">{data.content.goal}</div>
              </div>
              
              <div className="mb-6 flex gap-3">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${data.content.approved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {data.content.approved ? 'Critic Approved' : 'Review Needed'}
                </span>
                <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100">
                  Confidence: {Math.round(data.content.confidence * 100)}%
                </span>
              </div>
              
              <hr className="my-6 border-gray-100" />
              
              <div 
                className="prose prose-sm sm:prose-base max-w-none text-gray-800"
                dangerouslySetInnerHTML={{ __html: marked.parse(data.content.final_report || '') }}
              />

              {data.content.chart_specs?.length > 0 && (
                <div className="mt-8 p-6 bg-gray-50 rounded-xl border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-widest mb-4">Data Visualization Data</h3>
                  <pre className="text-xs overflow-x-auto p-4 bg-white rounded border border-gray-100">
                    {JSON.stringify(data.content.chart_specs, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      
      <footer className="bg-white border-t border-gray-200 py-4 text-center text-sm text-gray-500">
        Generated by <a href="/" className="font-semibold text-[#0F6E56] hover:underline">FinChatBot</a>
      </footer>
    </div>
  );
};

export default SharePage;
