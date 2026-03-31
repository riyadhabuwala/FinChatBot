import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { mockUploadedFiles } from '../utils/mockData';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

const useChatStore = create(persist((set, get) => ({
  // Current active mode
  activeMode: 'smart_chat',
  setActiveMode: (mode) => set({ activeMode: mode }),

  // Auth token (for API calls)
  authToken: null,
  setAuthToken: (token) => set({ authToken: token }),

  // Uploaded files — use mock if VITE_USE_MOCK=true
  uploadedFiles: USE_MOCK ? [...mockUploadedFiles] : [],
  addFile: (file) =>
    set((state) => ({
      uploadedFiles: [
        ...state.uploadedFiles,
        { id: file.id || nanoid(), name: file.name, size: file.size, type: file.type, status: file.status || 'uploading' },
      ],
    })),
  updateFileStatus: (id, status) =>
    set((state) => ({
      uploadedFiles: state.uploadedFiles.map((f) => (f.id === id ? { ...f, status } : f)),
    })),
  removeFile: (id) =>
    set((state) => ({
      uploadedFiles: state.uploadedFiles.filter((f) => f.id !== id),
    })),
  setFiles: (files) => set({ uploadedFiles: files }),

  // Conversations per mode
  conversations: {
    smart_chat: [],
    document_analysis: [],
    insights: [],
    agentic: [],
  },
  addMessage: (mode, message) =>
    set((state) => ({
      conversations: {
        ...state.conversations,
        [mode]: [...(state.conversations[mode] || []), { id: nanoid(), timestamp: Date.now(), ...message }],
      },
    })),
  updateLastMessage: (mode, updates) =>
    set((state) => {
      const msgs = [...(state.conversations[mode] || [])];
      if (msgs.length > 0) {
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], ...updates };
      }
      return { conversations: { ...state.conversations, [mode]: msgs } };
    }),
  clearChat: (mode) =>
    set((state) => ({
      conversations: { ...state.conversations, [mode]: [] },
    })),

  // Streaming state
  isStreaming: false,
  setStreaming: (bool) => set({ isStreaming: bool }),

  // Agent state (for agentic mode)
  agentSteps: [],
  setAgentSteps: (steps) => set({ agentSteps: steps }),
  updateAgentStep: (id, update) =>
    set((state) => ({
      agentSteps: state.agentSteps.map((s) => (s.id === id ? { ...s, ...update } : s)),
    })),
  addAgentStep: (step) =>
    set((state) => ({
      agentSteps: [...state.agentSteps, step],
    })),

  // Insights state
  insights: [],
  setInsights: (insights) => set({ insights }),
  isScanning: false,
  setScanning: (bool) => set({ isScanning: bool }),

  // Toast notifications
  toasts: [],
  addToast: (toast) => {
    const id = nanoid();
    set((state) => ({ toasts: [...state.toasts, { id, ...toast }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },

  // File upload modal
  isUploadModalOpen: false,
  setUploadModalOpen: (bool) => set({ isUploadModalOpen: bool }),

  // Sidebar collapsed (mobile)
  isSidebarOpen: true,
  setSidebarOpen: (bool) => set({ isSidebarOpen: bool }),
}), {
  name: 'finchatbot-chat-store',
  partialize: (state) => ({
    activeMode: state.activeMode,
    conversations: state.conversations,
  }),
}));

export default useChatStore;
