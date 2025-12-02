import clsx from "clsx";
import type { ReactNode } from "react";

type ModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
  className?: string;
};

export const Modal = ({ title, onClose, children, closeLabel = "Close", className }: ModalProps) => (
  <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-10">
    <div className="fixed inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
    <div
      className={clsx(
        "relative z-10 w-full max-w-2xl rounded-2xl border border-border bg-surface-100 p-6 shadow-2xl",
        "max-h-[calc(100vh-4rem)] overflow-y-auto",
        className,
      )}
      role="dialog"
      aria-modal="true"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-3 py-1 text-sm text-muted hover:text-fg"
        >
          {closeLabel}
        </button>
      </div>
      {children}
    </div>
  </div>
);
