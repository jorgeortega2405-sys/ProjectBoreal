import { loadTemplate } from '../services/template.service.js';
import { login } from '../services/api.service.js';
import { navigate } from '../app-router.js';
import { ViewController } from '../types/common.types.js';

class LoginViewController implements ViewController {
  private abortController: AbortController | null = null;
  private boundHandleSubmit: (e: Event) => void;
  private boundTogglePassword: () => void;
  private element: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;
    this.boundHandleSubmit = this.handleSubmit.bind(this);
    this.boundTogglePassword = this.handleTogglePassword.bind(this);
  }

  init(): void {
    this.abortController = new AbortController();
    this.bindEvents();
  }

  bindEvents(): void {
    const { signal } = this.abortController!;

    const form = this.element.querySelector<HTMLFormElement>('[data-ref="login-form"]');
    const submitBtn = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-submit-login"]');
    const toggleBtn = this.element.querySelector<HTMLButtonElement>('[data-ref="toggle-login-password"]');

    form?.addEventListener('submit', this.boundHandleSubmit, { signal });
    submitBtn?.addEventListener('click', this.boundHandleSubmit, { signal });
    toggleBtn?.addEventListener('click', this.boundTogglePassword, { signal });
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private handleTogglePassword(): void {
    const passwordInput = this.element.querySelector<HTMLInputElement>('[data-ref="login-password"]');
    if (!passwordInput) return;
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
  }

  private showError(message: string): void {
    const errorBanner = this.element.querySelector<HTMLElement>('[data-ref="login-error"]');
    if (errorBanner) {
      errorBanner.textContent = message;
      errorBanner.style.display = 'block';
    }
  }

  private hideError(): void {
    const errorBanner = this.element.querySelector<HTMLElement>('[data-ref="login-error"]');
    if (errorBanner) {
      errorBanner.textContent = '';
      errorBanner.style.display = 'none';
    }
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    this.hideError();

    const emailInput = this.element.querySelector<HTMLInputElement>('[data-ref="login-email"]');
    const passwordInput = this.element.querySelector<HTMLInputElement>('[data-ref="login-password"]');
    const submitBtn = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-submit-login"]');

    const email = emailInput?.value?.trim() || '';
    const password = passwordInput?.value || '';

    if (!email || !password) {
      this.showError('Por favor ingresa tu correo y contraseña.');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('is-loading');
    }

    try {
      const res = await login(email, password);
      if (res.success) {
        navigate('/');
      } else {
        this.showError(res.error || 'Credenciales inválidas.');
      }
    } catch {
      this.showError('Ha ocurrido un error inesperado al procesar la solicitud.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('is-loading');
      }
    }
  }
}

export async function createLoginView(): Promise<HTMLElement> {
  const element = await loadTemplate('/views/auth/login.html');
  const controller = new LoginViewController(element);
  controller.init();
  (element as any).__controller = controller;
  return element;
}
