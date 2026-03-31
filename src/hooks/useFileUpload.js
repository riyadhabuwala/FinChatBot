import { useCallback, useState } from 'react';
import useChatStore from '../store/useChatStore';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/json',
  'text/plain',
];

export function useFileUpload() {
  const { uploadedFiles, addFile, updateFileStatus, removeFile, addToast } = useChatStore();
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = useCallback(
    async (file) => {
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        addToast({ type: 'error', message: `File "${file.name}" exceeds 50MB limit` });
        return;
      }

      // Validate file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        addToast({ type: 'error', message: `Unsupported file type: ${file.type || 'unknown'}` });
        return;
      }

      setIsUploading(true);

      if (USE_MOCK) {
        // ── Mock path ──
        const fileEntry = { name: file.name, size: file.size, type: file.type };
        addFile(fileEntry);

        const files = useChatStore.getState().uploadedFiles;
        const addedFile = files[files.length - 1];

        setTimeout(() => {
          updateFileStatus(addedFile.id, 'ready');
          setIsUploading(false);
          addToast({ type: 'success', message: `"${file.name}" uploaded successfully` });
        }, 1500);
      } else {
        // ── Real API path ──
        try {
          // Add a temporary uploading entry
          addFile({ name: file.name, size: file.size, type: file.type, status: 'uploading' });

          const formData = new FormData();
          formData.append('files', file);

          const token = useChatStore.getState().authToken;
          const headers = {};
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }

          const response = await fetch(`${API_BASE}/api/upload`, {
            method: 'POST',
            headers,
            body: formData,
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || errData.message || `Upload failed (${response.status})`);
          }

          const data = await response.json();

          if (data.files && data.files.length > 0) {
            const serverFile = data.files[0];
            // Remove the temp entry and add the real one with server ID
            const currentFiles = useChatStore.getState().uploadedFiles;
            const tempFile = currentFiles[currentFiles.length - 1];
            if (tempFile) {
              useChatStore.getState().removeFile(tempFile.id);
            }
            addFile({
              id: serverFile.id,
              name: serverFile.name,
              size: serverFile.size,
              type: serverFile.type,
              status: 'ready',
            });

            addToast({ type: 'success', message: `"${serverFile.name}" uploaded successfully` });
          }
        } catch (err) {
          // Remove the temp uploading entry
          const currentFiles = useChatStore.getState().uploadedFiles;
          const tempFile = currentFiles.find((f) => f.name === file.name && f.status === 'uploading');
          if (tempFile) {
            useChatStore.getState().removeFile(tempFile.id);
          }

          addToast({ type: 'error', message: err.message || `Failed to upload "${file.name}"` });
        } finally {
          setIsUploading(false);
        }
      }
    },
    [addFile, updateFileStatus, addToast],
  );

  const handleRemoveFile = useCallback(
    async (fileId) => {
      removeFile(fileId);

      if (!USE_MOCK) {
        try {
          const token = useChatStore.getState().authToken;
          await fetch(`${API_BASE}/api/upload/${fileId}`, {
            method: 'DELETE',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
        } catch {
          // Non-critical — local state already removed
        }
      }
    },
    [removeFile],
  );

  return { uploadFile, uploadedFiles, removeFile: handleRemoveFile, isUploading };
}
