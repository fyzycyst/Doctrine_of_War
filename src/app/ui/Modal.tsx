import { useEffect, useRef, type ReactNode, type RefObject } from "react";

/**
 * A native modal <dialog>: showModal() makes the rest of the page inert and keeps
 * Tab inside, and Escape arrives as a cancel. On close, focus returns to
 * `returnFocus()` if given, else to whatever had focus when the dialog opened.
 */
export function Modal({
  className,
  role,
  labelledBy,
  describedBy,
  initialFocus,
  returnFocus,
  onCancel,
  children,
}: {
  className?: string;
  role?: "dialog" | "alertdialog";
  labelledBy: string;
  describedBy?: string;
  initialFocus?: RefObject<HTMLElement | null>;
  returnFocus?: () => HTMLElement | null;
  /** Escape. Without it, Escape is ignored (the dialog needs an explicit choice). */
  onCancel?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  const restore = useRef(returnFocus);
  restore.current = returnFocus;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return undefined;
    }
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) {
      dialog.showModal();
    }
    initialFocus?.current?.focus();
    return () => {
      if (dialog.open) {
        dialog.close();
      }
      const target = restore.current?.() ?? opener;
      if (target?.isConnected) {
        target.focus();
      }
    };
    // Opens once per mount; later prop changes do not reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={ref}
      className={className}
      role={role}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault();
        cancel.current?.();
      }}
    >
      {children}
    </dialog>
  );
}

/** The active roster tab: where focus goes back to after a report or retry. */
export const rosterFocus = () => document.querySelector<HTMLElement>('.roster [role="option"][tabindex="0"]');
