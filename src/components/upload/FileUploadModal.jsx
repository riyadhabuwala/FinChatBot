import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { FileDropZone } from './FileDropZone';
import { UploadedFilesList } from './UploadedFilesList';
import { useFileUpload } from '../../hooks/useFileUpload';

export function FileUploadModal({ open, onOpenChange }) {
  const { uploadFile, uploadedFiles, removeFile } = useFileUpload();

  const handleDrop = (acceptedFiles) => {
    acceptedFiles.forEach((file) => uploadFile(file));
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] animate-fade-in" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100]
            w-full max-w-lg bg-bg-card border border-border-default rounded-2xl
            shadow-2xl animate-slide-up p-6 max-h-[85vh] overflow-y-auto
            focus:outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-text-primary">
              Upload Documents
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <FileDropZone onDrop={handleDrop} />
          <UploadedFilesList files={uploadedFiles} onRemove={removeFile} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
