import { navigate } from '../app-router.js';
import { login } from '../services/auth.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { ViewController } from '../types/common.types.js';

export class LoginController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private isSubmitting = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  init(): void {
    this.abortController = new AbortController();
    this.bindEvents();
    renderIcons(this.container);

    const emailInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-email"]');
    if (emailInput) {
      setTimeout(() => emailInput.focus(), 80);
    }
  }

  bindEvents(): void {
    const signal = this.abortController?.signal;

    const form = this.container.querySelector<HTMLFormElement>('[data-ref="form-login"]');
    const togglePasswordBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-password"]');
    const passwordInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-password"]');

    togglePasswordBtn?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (!passwordInput) return;

        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';

        const iconUse = togglePasswordBtn.querySelector<SVGUseElement>('use');
        if (iconUse) {
          iconUse.setAttribute('href', isPassword ? '/icons.svg#visibility_off' : '/icons.svg#visibility');
        }

        const label = isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña';
        togglePasswordBtn.setAttribute('data-tooltip', label);
        togglePasswordBtn.setAttribute('aria-label', label);
      },
      { signal }
    );

    form?.addEventListener(
      'submit',
      (e) => {
        e.preventDefault();
        void this.handleSubmit();
      },
      { signal }
    );

    const inputs = this.container.querySelectorAll<HTMLInputElement>('input');
    inputs.forEach((input) => {
      input.addEventListener(
        'input',
        () => {
          this.hideError();
        },
        { signal }
      );
    });
  }

  private showError(message: string): void {
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="login-error"]');
    if (errorBanner) {
      errorBanner.textContent = message;
      errorBanner.classList.remove('is-hidden');
    }
  }

  private hideError(): void {
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="login-error"]');
    if (errorBanner) {
      errorBanner.textContent = '';
      errorBanner.classList.add('is-hidden');
    }
  }

  private setButtonLoading(isLoading: boolean): void {
    this.isSubmitting = isLoading;
    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-login"]');
    const btnText = submitBtn?.querySelector<HTMLElement>('.component-button__text');
    if (submitBtn && btnText) {
      submitBtn.disabled = isLoading;
      if (isLoading) {
        btnText.textContent = 'Verificando...';
        submitBtn.style.opacity = '0.75';
      } else {
        btnText.textContent = 'Iniciar Sesión';
        submitBtn.style.opacity = '';
      }
    }
  }

  private async handleSubmit(): Promise<void> {
    if (this.isSubmitting) return;

    this.hideError();

    const emailInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-email"]');
    const passwordInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-password"]');

    const email = emailInput?.value.trim() || '';
    const password = passwordInput?.value || '';

    if (!email) {
      this.showError('Por favor ingresa tu correo electrónico.');
      emailInput?.focus();
      return;
    }

    if (!email.includes('@') || !email.includes('.')) {
      this.showError('Ingresa un formato de correo electrónico válido.');
      emailInput?.focus();
      return;
    }

    if (!password) {
      this.showError('Por favor ingresa tu contraseña.');
      passwordInput?.focus();
      return;
    }

    this.setButtonLoading(true);

    try {
      const res = await login(email, password);
      if (!res.success) {
        this.showError(res.error || 'Correo o contraseña incorrectos.');
        this.setButtonLoading(false);
        return;
      }

      navigate('/');
    } catch {
      this.showError('Error de conexión al iniciar sesión. Por favor intenta más tarde.');
      this.setButtonLoading(false);
    }
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createLoginView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/auth/login.html');
  const controller = new LoginController(container);
  controller.init();
  (container as any).__controller = controller;
  return container;
}
