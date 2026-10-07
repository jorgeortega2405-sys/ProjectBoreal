import { createPopper, Instance as PopperInstance, Placement } from '@popperjs/core';

let tooltipEl: HTMLElement | null = null;
let tooltipText: HTMLElement | null = null;
let tooltipArrow: HTMLElement | null = null;
let currentPopperInstance: PopperInstance | null = null;
let activeTarget: HTMLElement | null = null;

function createTooltipElement(text: string): { arrow: HTMLElement; content: HTMLElement; el: HTMLElement } {
  const el = document.createElement('div');
  el.className = 'tooltip';
  el.setAttribute('data-ref', 'app-tooltip');
  el.setAttribute('role', 'tooltip');

  const content = document.createElement('span');
  content.className = 'tooltip__content';
  content.setAttribute('data-ref', 'tooltip-text');
  content.textContent = text;

  const arrow = document.createElement('div');
  arrow.className = 'tooltip__arrow';
  arrow.setAttribute('data-ref', 'tooltip-arrow');
  arrow.setAttribute('data-popper-arrow', '');

  el.appendChild(content);
  el.appendChild(arrow);

  return { arrow, content, el };
}

export function showTooltip(target: HTMLElement | null): void {
  if (!target) return;
  const text = target.getAttribute('data-tooltip') || target.getAttribute('data-i18n-tooltip');
  if (!text || !text.trim()) {
    hideTooltip();
    return;
  }

  if (activeTarget === target && tooltipEl && tooltipText) {
    if (tooltipText.textContent !== text) {
      tooltipText.textContent = text;
      if (currentPopperInstance) {
        currentPopperInstance.update();
      }
    }
    return;
  }

  hideTooltip();

  const elements = createTooltipElement(text);
  tooltipEl = elements.el;
  tooltipText = elements.content;
  tooltipArrow = elements.arrow;
  activeTarget = target;

  document.body.appendChild(tooltipEl);

  const preferredPlacement = (target.getAttribute('data-tooltip-placement') || 'right') as Placement;

  currentPopperInstance = createPopper(target, tooltipEl, {
    placement: preferredPlacement,
    modifiers: [
      {
        name: 'offset',
        options: { offset: [0, 8] },
      },
      {
        name: 'preventOverflow',
        options: { padding: 8 },
      },
      {
        name: 'arrow',
        options: { element: tooltipArrow, padding: 4 },
      },
    ],
  });

  requestAnimationFrame(() => {
    tooltipEl?.classList.add('is-visible');
  });
}

export function hideTooltip(): void {
  if (tooltipEl) {
    tooltipEl.remove();
    tooltipEl = null;
    tooltipText = null;
    tooltipArrow = null;
  }
  if (currentPopperInstance) {
    currentPopperInstance.destroy();
    currentPopperInstance = null;
  }
  activeTarget = null;
}

export function initTooltips(): void {
  document.addEventListener('mouseover', (e: MouseEvent) => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tooltip], [data-i18n-tooltip]');
    if (target) {
      showTooltip(target);
    }
  });

  document.addEventListener('mouseout', (e: MouseEvent) => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tooltip], [data-i18n-tooltip]');
    if (target && target === activeTarget) {
      hideTooltip();
    }
  });

  document.addEventListener('click', () => {
    hideTooltip();
  });
}
