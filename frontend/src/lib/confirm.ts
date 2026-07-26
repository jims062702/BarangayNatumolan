import Swal from "sweetalert2";

interface ConfirmOptions {
  title?: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  /** Red confirm button + warning icon for destructive actions. */
  danger?: boolean;
}

/**
 * Shows a SweetAlert confirmation and resolves true only if the user confirms.
 * Use before any action that changes data:
 *   if (!(await confirmAction({ text: "..." }))) return;
 */
export async function confirmAction(options: ConfirmOptions = {}): Promise<boolean> {
  const result = await Swal.fire({
    title: options.title ?? "Are you sure?",
    text: options.text,
    icon: options.danger ? "warning" : "question",
    showCancelButton: true,
    confirmButtonText: options.confirmText ?? "Yes, continue",
    cancelButtonText: options.cancelText ?? "Cancel",
    confirmButtonColor: options.danger ? "#DC2626" : "#723EC3",
    cancelButtonColor: "#6B7280",
    reverseButtons: true,
  });
  return result.isConfirmed;
}
