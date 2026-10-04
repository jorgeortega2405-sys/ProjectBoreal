export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'danger';

export interface ViewController {
  init(container: HTMLElement): Promise<void> | void;
  destroy(): void;
}

export interface ModalOptions {
  bodyHtml?: string | HTMLElement;
  cancelText?: string;
  confirmClass?: string;
  confirmText?: string;
  description?: string;
  onCancel?: (() => boolean | Promise<boolean> | void) | null;
  onClose?: (() => void) | null;
  onConfirm?: (() => boolean | Promise<boolean> | void) | null;
  showCancel?: boolean;
  showConfirm?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  title?: string;
}

export interface ModalInstance {
  backdrop: HTMLElement;
  body: HTMLElement;
  btnCancel: HTMLButtonElement | null;
  btnConfirm: HTMLButtonElement | null;
  card: HTMLElement | null;
  close: () => void;
  closeBtn: HTMLElement | null;
  errorBanner: HTMLElement | null;
  setDescription: (desc: string) => void;
  setError: (msg: string) => void;
  setTitle: (title: string) => void;
}
