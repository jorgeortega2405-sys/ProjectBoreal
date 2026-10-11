import { createPopper, Instance as PopperInstance, Placement } from '@popperjs/core';
import { EmptyIllustrationKey, getEmptyIllustration } from '../graphics/empty-illustrations.graphics.js';

export interface ActiveDropdownRecord {
  close: () => void;
  wrapper: HTMLElement;
}

export interface DropdownOptions {
  backdrop?: HTMLElement | null;
  container?: HTMLElement;
  isSelect?: boolean;
  matchWidth?: boolean;
  menu?: HTMLElement | null;
  offset?: [number, number];
  onClose?: () => void;
  onOpen?: () => void;
  onSelect?: (value: string, trigger: HTMLElement) => void;
  placement?: Placement;
  trigger?: HTMLElement | null;
}

export interface DropdownController {
  close: () => void;
  destroy: () => void;
  open: () => void;
  toggle: () => void;
  update: () => void;
}

export interface DatePickerDropdownOptions {
  fieldRef?: string;
  initialValue?: string;
  inputRef?: string;
  key: string;
  label: string;
  maxDate?: string;
  minDate?: string;
  onChange?: (isoDate: string) => void;
  placement?: Placement;
}

export interface DatePickerDropdownController extends DropdownController {
  getValue: () => string;
  setValue: (isoDate: string, silent?: boolean) => void;
}

export interface RenderEmptyStateOptions {
  actionDataRef?: string;
  actionLabel?: string;
  container: HTMLElement;
  dataRef?: string;
  desc: string;
  graphicType: string | EmptyIllustrationKey;
  isTable?: boolean;
  onAction?: (e: MouseEvent) => void;
  title: string;
}

const activeDropdowns: ActiveDropdownRecord[] = [];

export function registerActiveDropdown(record: ActiveDropdownRecord): void {
  for (let i = activeDropdowns.length - 1; i >= 0; i--) {
    const active = activeDropdowns[i];
    if (active.wrapper === record.wrapper) continue;
    if (!active.wrapper.contains(record.wrapper)) {
      activeDropdowns.splice(i, 1);
      active.close();
    }
  }
  if (!activeDropdowns.some((item) => item.wrapper === record.wrapper)) {
    activeDropdowns.push(record);
  }
}

export function unregisterActiveDropdown(wrapperOrClose: HTMLElement | (() => void)): void {
  const index = activeDropdowns.findIndex(
    (item) => item.wrapper === wrapperOrClose || item.close === wrapperOrClose
  );
  if (index !== -1) {
    activeDropdowns.splice(index, 1);
  }
}

export function closeAllDropdowns(exceptWrapperOrClose?: HTMLElement | (() => void)): void {
  for (let i = activeDropdowns.length - 1; i >= 0; i--) {
    const active = activeDropdowns[i];
    if (
      exceptWrapperOrClose &&
      (active.wrapper === exceptWrapperOrClose || active.close === exceptWrapperOrClose)
    ) {
      continue;
    }
    activeDropdowns.splice(i, 1);
    active.close();
  }
}

export function setupDropdown(
  wrapperOrOptions: HTMLElement | DropdownOptions,
  maybeOptions?: DropdownOptions
): DropdownController {
  let wrapper: HTMLElement | null = null;
  let options: DropdownOptions = {};

  if (wrapperOrOptions && (typeof (wrapperOrOptions as any).nodeType === 'number' || wrapperOrOptions instanceof HTMLElement)) {
    wrapper = wrapperOrOptions as HTMLElement;
    options = maybeOptions || {};
  } else if (wrapperOrOptions && typeof wrapperOrOptions === 'object') {
    options = wrapperOrOptions as DropdownOptions;
    wrapper = options.container || null;
  }

  if (!wrapper) {
    return { close: () => {}, destroy: () => {}, open: () => {}, toggle: () => {}, update: () => {} };
  }

  const trigger =
    options.trigger ||
    (wrapper ? (Array.from(wrapper.children).find((c) =>
      c.classList.contains('dropdown-trigger') ||
      c.getAttribute('data-ref')?.includes('trigger') ||
      c.tagName === 'BUTTON' ||
      c.classList.contains('component-button')
    ) as HTMLElement) : null) ||
    wrapper.querySelector<HTMLElement>('.dropdown-trigger, [data-ref*="trigger"]');

  const backdrop =
    options.backdrop ||
    wrapper.querySelector<HTMLElement>(':scope > .dropdown-backdrop, :scope > [data-ref*="backdrop"]') ||
    wrapper.querySelector<HTMLElement>('.dropdown-backdrop, [data-ref*="backdrop"]');

  const menu =
    options.menu ||
    backdrop?.querySelector<HTMLElement>(':scope > .menu-panel--dropdown, :scope > [data-ref*="menu"]') ||
    backdrop?.querySelector<HTMLElement>('.menu-panel--dropdown, [data-ref*="menu"]') ||
    wrapper.querySelector<HTMLElement>('.menu-panel--dropdown, [data-ref*="menu"]');

  const dragZone =
    menu?.querySelector<HTMLElement>('.menu-panel__drag-zone, [data-ref*="drag-zone"]') ||
    wrapper.querySelector<HTMLElement>('.menu-panel__drag-zone, [data-ref*="drag-zone"]');

  const selectedTextEl = trigger?.querySelector<HTMLElement>('.dropdown-trigger__text, [data-ref*="selected-text"]') || null;
  const isSelect = typeof options.isSelect === 'boolean' ? options.isSelect : Boolean(selectedTextEl || options.onSelect);

  const hasExplicitWidthClass = Boolean(
    menu && Array.from(menu.classList).some((c) => c.startsWith('menu-panel--w-') && c !== 'menu-panel--w-full')
  );
  const isIconButton = Boolean(trigger?.classList.contains('component-button--icon-only'));
  const shouldMatchWidth = options.matchWidth !== undefined
    ? options.matchWidth
    : (!hasExplicitWidthClass && !isIconButton && (isSelect || Boolean(menu?.classList.contains('menu-panel--w-full'))));
  const defaultPlacement: Placement = isIconButton ? 'bottom-end' : 'bottom-start';

  let isClosing = false;
  let popperInstance: PopperInstance | null = null;

  const destroyPopper = () => {
    if (popperInstance) {
      popperInstance.destroy();
      popperInstance = null;
      if (!shouldMatchWidth && menu) {
        menu.style.width = '';
      }
    }
  };

  const createPopperInstance = () => {
    if (window.innerWidth > 768 && trigger && menu) {
      destroyPopper();
      if (!shouldMatchWidth) {
        menu.style.width = '';
      }
      popperInstance = createPopper(trigger, menu, {
        modifiers: [
          {
            name: 'offset',
            options: {
              offset: options.offset || [0, 6],
            },
          },
          {
            name: 'flip',
            options: {
              fallbackPlacements: ['top-start', 'bottom-end', 'top-end'],
              padding: 8,
            },
          },
          {
            name: 'preventOverflow',
            options: {
              boundary: 'clippingParents',
              padding: 8,
            },
          },
        ],
        placement: options.placement || defaultPlacement,
      });
      popperInstance.update();
    }
  };

  const openDropdown = () => {
    if (isClosing) return;

    registerActiveDropdown({
      close: closeDropdown,
      wrapper,
    });

    if (window.innerWidth <= 768 && backdrop && menu) {
      destroyPopper();
      backdrop.style.display = 'flex';
      backdrop.style.opacity = '0';
      backdrop.style.pointerEvents = 'auto';
      menu.style.transform = 'translateY(100%)';
      menu.style.transition = 'none';
      backdrop.style.transition = 'none';

      void menu.offsetHeight;

      backdrop.classList.add('is-open');
      menu.classList.add('is-open');
      trigger?.classList.add('is-open');
      wrapper?.classList.add('is-open');

      backdrop.style.transition = 'opacity 0.25s ease';
      menu.style.transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
      backdrop.style.opacity = '1';
      menu.style.transform = 'translateY(0)';
    } else {
      backdrop?.classList.add('is-open');
      menu?.classList.add('is-open');
      trigger?.classList.add('is-open');
      wrapper?.classList.add('is-open');
      createPopperInstance();
    }

    const searchInput = menu?.querySelector<HTMLInputElement>('.menu-panel__search-input, [data-ref*="search"]');
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 60);
    }

    if (typeof options.onOpen === 'function') {
      options.onOpen();
    }
  };

  const closeDropdown = () => {
    if (isClosing || !menu?.classList.contains('is-open')) return;

    unregisterActiveDropdown(wrapper);
    destroyPopper();

    if (window.innerWidth <= 768 && backdrop && menu) {
      isClosing = true;
      backdrop.style.pointerEvents = 'none';
      backdrop.style.transition = 'opacity 0.2s ease';
      menu.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 1, 1)';
      backdrop.style.opacity = '0';
      menu.style.transform = 'translateY(100%)';

      setTimeout(() => {
        backdrop.classList.remove('is-open');
        menu.classList.remove('is-open');
        trigger?.classList.remove('is-open');
        wrapper?.classList.remove('is-open');
        backdrop.style.display = '';
        backdrop.style.opacity = '';
        backdrop.style.transition = '';
        backdrop.style.pointerEvents = '';
        menu.style.transform = '';
        menu.style.transition = '';
        isClosing = false;
        if (typeof options.onClose === 'function') {
          options.onClose();
        }
      }, 200);
    } else {
      backdrop?.classList.remove('is-open');
      menu?.classList.remove('is-open');
      trigger?.classList.remove('is-open');
      wrapper?.classList.remove('is-open');
      if (backdrop) {
        backdrop.style.display = '';
        backdrop.style.opacity = '';
        backdrop.style.transition = '';
      }
      if (menu) {
        menu.style.transform = '';
        menu.style.transition = '';
        if (!shouldMatchWidth) {
          menu.style.width = '';
        }
      }
      if (typeof options.onClose === 'function') {
        options.onClose();
      }
    }
  };

  const toggleDropdown = () => {
    if (menu?.classList.contains('is-open') && !isClosing) {
      closeDropdown();
    } else {
      openDropdown();
    }
  };

  const onTriggerClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleDropdown();
  };
  trigger?.addEventListener('click', onTriggerClick);

  const onBackdropClick = (e: MouseEvent) => {
    if (!menu?.contains(e.target as Node)) {
      closeDropdown();
    }
  };
  backdrop?.addEventListener('click', onBackdropClick);

  let startY = 0;
  let currentY = 0;
  let startTime = 0;
  let isDragging = false;
  let activePointerId: number | null = null;

  const detachPointerListeners = () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (window.innerWidth > 768 || isClosing || !menu) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    isDragging = true;
    activePointerId = e.pointerId;
    startY = e.clientY;
    currentY = startY;
    startTime = performance.now();

    try {
      dragZone?.setPointerCapture(activePointerId);
    } catch {}

    menu.style.transition = 'none';
    if (backdrop) {
      backdrop.style.transition = 'none';
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
    currentY = e.clientY;
    const diff = currentY - startY;

    if (menu) {
      if (diff > 0) {
        menu.style.transform = `translateY(${diff}px)`;
        if (backdrop) {
          const progress = Math.min(diff / 220, 1);
          backdrop.style.opacity = `${Math.max(0.2, 1 - progress * 0.8)}`;
        }
      } else {
        const rubberDiff = Math.max(diff * 0.15, -24);
        menu.style.transform = `translateY(${rubberDiff}px)`;
      }
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
    isDragging = false;
    detachPointerListeners();

    try {
      if (activePointerId !== null) {
        dragZone?.releasePointerCapture(activePointerId);
      }
    } catch {}
    activePointerId = null;

    const diff = currentY - startY;
    const elapsed = Math.max(1, performance.now() - startTime);
    const velocity = diff / elapsed;

    if (diff > 75 || (diff > 25 && velocity > 0.45)) {
      closeDropdown();
    } else {
      if (backdrop) {
        backdrop.style.transition = 'opacity 0.25s ease';
        backdrop.style.opacity = '1';
      }
      if (menu) {
        menu.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
        menu.style.transform = 'translateY(0)';
      }
    }
  };

  dragZone?.addEventListener('pointerdown', onPointerDown);
  dragZone?.addEventListener('lostpointercapture', onPointerUp);

  const onDocClick = (e: MouseEvent) => {
    if (!wrapper.contains(e.target as Node)) {
      closeDropdown();
    }
  };
  document.addEventListener('click', onDocClick);

  const onDocKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && menu?.classList.contains('is-open')) {
      closeDropdown();
    }
  };
  document.addEventListener('keydown', onDocKeydown);

  const destroy = () => {
    unregisterActiveDropdown(wrapper);
    trigger?.removeEventListener('click', onTriggerClick);
    backdrop?.removeEventListener('click', onBackdropClick);
    dragZone?.removeEventListener('pointerdown', onPointerDown);
    dragZone?.removeEventListener('lostpointercapture', onPointerUp);
    detachPointerListeners();
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onDocKeydown);
    destroyPopper();
  };

  return {
    close: closeDropdown,
    destroy,
    open: openDropdown,
    toggle: toggleDropdown,
    update: () => popperInstance?.update(),
  };
}

export function getEmptyGraphicSvg(type: string | EmptyIllustrationKey): string {
  return getEmptyIllustration(type);
}

export function renderEmptyState(options: RenderEmptyStateOptions): HTMLElement {
  removeEmptyState(options.container, options.dataRef);

  const emptyEl = document.createElement('div');
  emptyEl.className = `component-empty-state${options.isTable ? ' component-empty-state--table' : ''}`;
  if (options.dataRef) {
    emptyEl.setAttribute('data-ref', options.dataRef);
  }

  const graphicEl = document.createElement('div');
  graphicEl.className = 'component-empty-state-graphic';
  graphicEl.innerHTML = getEmptyGraphicSvg(options.graphicType);

  const titleEl = document.createElement('h2');
  titleEl.className = 'component-empty-state-title';
  titleEl.textContent = options.title;

  const descEl = document.createElement('p');
  descEl.className = 'component-empty-state-desc';
  descEl.textContent = options.desc;

  emptyEl.appendChild(graphicEl);
  emptyEl.appendChild(titleEl);
  emptyEl.appendChild(descEl);

  if (options.actionLabel) {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'component-button component-button--h40 component-button--secondary';
    if (options.actionDataRef) {
      actionBtn.setAttribute('data-ref', options.actionDataRef);
    }
    const spanEl = document.createElement('span');
    if (options.actionDataRef) {
      spanEl.setAttribute('data-ref', `${options.actionDataRef}-label`);
    }
    spanEl.textContent = options.actionLabel;
    actionBtn.appendChild(spanEl);
    if (options.onAction) {
      actionBtn.addEventListener('click', options.onAction);
    }
    emptyEl.appendChild(actionBtn);
  }

  options.container.appendChild(emptyEl);
  return emptyEl;
}

export function removeEmptyState(container: HTMLElement, dataRef?: string): void {
  const selector = dataRef ? `[data-ref="${dataRef}"]` : '.component-empty-state';
  const existing = container.querySelector(selector);
  if (existing) {
    existing.remove();
  }
}

export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const CALENDAR_MONTHS_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const CALENDAR_MONTHS_SHORT_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

const CALENDAR_WEEKDAYS_ES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

function getTodayIsoLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIsoDateParts(iso: string | undefined | null): { day: number; month: number; year: number } {
  const clean = (iso || '').trim().slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const probe = new Date(year, month, day);
    if (
      probe.getFullYear() === year &&
      probe.getMonth() === month &&
      probe.getDate() === day
    ) {
      return { day, month, year };
    }
  }
  const now = new Date();
  return {
    day: now.getDate(),
    month: now.getMonth(),
    year: now.getFullYear(),
  };
}

function toIsoDateString(year: number, month: number, day: number): string {
  const d = new Date(year, month, day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayStr}`;
}

export function formatDateTriggerLabel(iso: string | undefined | null): string {
  const { day, month, year } = parseIsoDateParts(iso);
  const dayPadded = String(day).padStart(2, '0');
  const monthShort = CALENDAR_MONTHS_SHORT_ES[month] || 'ene';
  return `${dayPadded} ${monthShort} ${year}`;
}

export function buildDatePickerDropdownHtml(options: DatePickerDropdownOptions): string {
  const key = options.key;
  const fieldRef = options.fieldRef || `field-dropdown-${key}`;
  const inputRef = options.inputRef || `input-${key}`;
  const parts = parseIsoDateParts(options.initialValue);
  const initialIso = toIsoDateString(parts.year, parts.month, parts.day);
  const displayLabel = formatDateTriggerLabel(initialIso);
  const weekdaysHtml = CALENDAR_WEEKDAYS_ES.map(
    (wd, idx) => `<span class="dropdown-calendar__weekday" data-ref="cal-wd-${escapeHtml(key)}-${idx}">${wd}</span>`
  ).join('');

  return `
    <div class="field field--dropdown" data-ref="${escapeHtml(fieldRef)}">
      <input class="is-hidden" data-ref="${escapeHtml(inputRef)}" type="hidden" value="${escapeHtml(initialIso)}" />
      <span class="field__label" data-ref="label-date-${escapeHtml(key)}">${escapeHtml(options.label)}</span>
      <div class="settings-dropdown-wrapper dropdown-wrapper dropdown-wrapper--full" data-ref="dropdown-wrapper-${escapeHtml(key)}">
        <button type="button" class="dropdown-trigger dropdown-trigger--full" data-ref="btn-trigger-${escapeHtml(key)}" aria-label="${escapeHtml(options.label)}">
          <div class="dropdown-trigger__left" data-ref="trigger-left-${escapeHtml(key)}">
            <svg class="component-icon dropdown-trigger__icon" data-ref="icon-selected-${escapeHtml(key)}" aria-hidden="true"><use class="component-icon__use" data-ref="icon-use-${escapeHtml(key)}" href="/icons.svg#calendar_month"></use></svg>
            <span class="dropdown-trigger__text" data-ref="text-selected-${escapeHtml(key)}">${escapeHtml(displayLabel)}</span>
          </div>
          <svg class="component-icon dropdown-trigger__chevron" data-ref="chevron-${escapeHtml(key)}" aria-hidden="true"><use class="component-icon__use" data-ref="chevron-use-${escapeHtml(key)}" href="/icons.svg#expand_more"></use></svg>
        </button>
        <div class="dropdown-backdrop" data-ref="dropdown-backdrop-${escapeHtml(key)}">
          <div class="menu-panel menu-panel--dropdown menu-panel--calendar menu-panel--h-auto" data-ref="dropdown-menu-${escapeHtml(key)}">
            <div class="menu-panel__drag-zone" data-ref="dropdown-drag-zone-${escapeHtml(key)}" aria-hidden="true">
              <div class="menu-panel__drag-handle" data-ref="dropdown-drag-handle-${escapeHtml(key)}"></div>
            </div>
            <div class="dropdown-calendar" data-ref="calendar-root-${escapeHtml(key)}">
              <div class="dropdown-calendar__header" data-ref="cal-header-${escapeHtml(key)}">
                <button type="button" class="dropdown-calendar__period-btn" data-ref="btn-cal-period-${escapeHtml(key)}" aria-label="Seleccionar mes y año">
                  <span class="dropdown-calendar__period-text" data-ref="cal-period-text-${escapeHtml(key)}">${CALENDAR_MONTHS_ES[parts.month]} ${parts.year}</span>
                  <svg class="component-icon dropdown-calendar__period-icon" data-ref="cal-period-icon-${escapeHtml(key)}" aria-hidden="true"><use class="component-icon__use" data-ref="cal-period-use-${escapeHtml(key)}" href="/icons.svg#expand_more"></use></svg>
                </button>
                <div class="dropdown-calendar__nav" data-ref="cal-nav-${escapeHtml(key)}">
                  <button type="button" class="dropdown-calendar__nav-btn" data-ref="btn-cal-prev-${escapeHtml(key)}" aria-label="Anterior">
                    <svg class="component-icon" data-ref="cal-prev-icon-${escapeHtml(key)}" aria-hidden="true"><use class="component-icon__use" data-ref="cal-prev-use-${escapeHtml(key)}" href="/icons.svg#chevron_left"></use></svg>
                  </button>
                  <button type="button" class="dropdown-calendar__nav-btn" data-ref="btn-cal-next-${escapeHtml(key)}" aria-label="Siguiente">
                    <svg class="component-icon" data-ref="cal-next-icon-${escapeHtml(key)}" aria-hidden="true"><use class="component-icon__use" data-ref="cal-next-use-${escapeHtml(key)}" href="/icons.svg#chevron_right"></use></svg>
                  </button>
                </div>
              </div>
              <div class="dropdown-calendar__days-view" data-ref="cal-days-view-${escapeHtml(key)}">
                <div class="dropdown-calendar__weekdays" data-ref="cal-weekdays-${escapeHtml(key)}">
                  ${weekdaysHtml}
                </div>
                <div class="dropdown-calendar__grid" data-ref="cal-grid-${escapeHtml(key)}"></div>
              </div>
              <div class="dropdown-calendar__ym-view is-hidden" data-ref="cal-ym-view-${escapeHtml(key)}">
                <div class="dropdown-calendar__years-row" data-ref="cal-years-row-${escapeHtml(key)}"></div>
                <div class="dropdown-calendar__months-grid" data-ref="cal-months-grid-${escapeHtml(key)}"></div>
              </div>
              <div class="dropdown-calendar__footer" data-ref="cal-footer-${escapeHtml(key)}">
                <button type="button" class="dropdown-calendar__today-btn" data-ref="btn-cal-today-${escapeHtml(key)}">Hoy</button>
                <span class="dropdown-calendar__selected-info" data-ref="cal-selected-info-${escapeHtml(key)}">${escapeHtml(displayLabel)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function setupDatePickerDropdown(
  container: HTMLElement,
  options: DatePickerDropdownOptions
): DatePickerDropdownController | null {
  const key = options.key;
  const inputRef = options.inputRef || `input-${key}`;
  const wrapper = container.querySelector<HTMLElement>(`[data-ref="dropdown-wrapper-${key}"]`);
  if (!wrapper) return null;

  const hiddenInput = container.querySelector<HTMLInputElement>(`[data-ref="${inputRef}"]`);
  const triggerTextEl = container.querySelector<HTMLElement>(`[data-ref="text-selected-${key}"]`);
  const calendarRoot = container.querySelector<HTMLElement>(`[data-ref="calendar-root-${key}"]`);
  const periodBtn = container.querySelector<HTMLButtonElement>(`[data-ref="btn-cal-period-${key}"]`);
  const periodTextEl = container.querySelector<HTMLElement>(`[data-ref="cal-period-text-${key}"]`);
  const prevBtn = container.querySelector<HTMLButtonElement>(`[data-ref="btn-cal-prev-${key}"]`);
  const nextBtn = container.querySelector<HTMLButtonElement>(`[data-ref="btn-cal-next-${key}"]`);
  const daysViewEl = container.querySelector<HTMLElement>(`[data-ref="cal-days-view-${key}"]`);
  const ymViewEl = container.querySelector<HTMLElement>(`[data-ref="cal-ym-view-${key}"]`);
  const gridEl = container.querySelector<HTMLElement>(`[data-ref="cal-grid-${key}"]`);
  const yearsRowEl = container.querySelector<HTMLElement>(`[data-ref="cal-years-row-${key}"]`);
  const monthsGridEl = container.querySelector<HTMLElement>(`[data-ref="cal-months-grid-${key}"]`);
  const todayBtn = container.querySelector<HTMLButtonElement>(`[data-ref="btn-cal-today-${key}"]`);
  const selectedInfoEl = container.querySelector<HTMLElement>(`[data-ref="cal-selected-info-${key}"]`);

  const initialParts = parseIsoDateParts(hiddenInput?.value || options.initialValue);
  let selectedIso = toIsoDateString(initialParts.year, initialParts.month, initialParts.day);
  let viewYear = initialParts.year;
  let viewMonth = initialParts.month;
  let viewMode: 'days' | 'ym' = 'days';

  const setViewMode = (mode: 'days' | 'ym') => {
    viewMode = mode;
    if (mode === 'ym') {
      daysViewEl?.classList.add('is-hidden');
      ymViewEl?.classList.remove('is-hidden');
      periodBtn?.classList.add('is-active');
    } else {
      ymViewEl?.classList.add('is-hidden');
      daysViewEl?.classList.remove('is-hidden');
      periodBtn?.classList.remove('is-active');
    }
    renderCalendar();
  };

  const renderCalendar = () => {
    const todayIso = getTodayIsoLocal();

    if (periodTextEl) {
      periodTextEl.textContent =
        viewMode === 'days'
          ? `${CALENDAR_MONTHS_ES[viewMonth]} ${viewYear}`
          : `Año ${viewYear}`;
    }

    if (selectedInfoEl) {
      selectedInfoEl.textContent = formatDateTriggerLabel(selectedIso);
    }

    if (viewMode === 'ym') {
      if (yearsRowEl) {
        const years: number[] = [viewYear - 2, viewYear - 1, viewYear, viewYear + 1, viewYear + 2];
        yearsRowEl.innerHTML = years
          .map((yr) => {
            const isCurrentYr = yr === viewYear;
            return `<button type="button" class="dropdown-calendar__year-chip${isCurrentYr ? ' is-active' : ''}" data-ref="btn-cal-year-${escapeHtml(key)}-${yr}" data-cal-year="${yr}">${yr}</button>`;
          })
          .join('');
      }
      if (monthsGridEl) {
        const selectedParts = parseIsoDateParts(selectedIso);
        monthsGridEl.innerHTML = CALENDAR_MONTHS_ES.map((mName, idx) => {
          const isSelectedMonth = idx === viewMonth && selectedParts.year === viewYear;
          const isActiveViewMonth = idx === viewMonth;
          const classes = [
            'dropdown-calendar__month-btn',
            isActiveViewMonth ? 'is-active' : '',
            isSelectedMonth ? 'is-selected' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return `<button type="button" class="${classes}" data-ref="btn-cal-month-${escapeHtml(key)}-${idx}" data-cal-month="${idx}">${mName.slice(0, 3)}</button>`;
        }).join('');
      }
      return;
    }

    if (!gridEl) return;

    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const startOffset = (firstDayOfWeek + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: string[] = [];
    for (let i = 0; i < 42; i++) {
      let cellYear = viewYear;
      let cellMonth = viewMonth;
      let cellDay = 1;
      let isOutside = false;

      if (i < startOffset) {
        isOutside = true;
        cellDay = daysInPrevMonth - startOffset + i + 1;
        cellMonth = viewMonth - 1;
        if (cellMonth < 0) {
          cellMonth = 11;
          cellYear = viewYear - 1;
        }
      } else if (i >= startOffset + daysInMonth) {
        isOutside = true;
        cellDay = i - (startOffset + daysInMonth) + 1;
        cellMonth = viewMonth + 1;
        if (cellMonth > 11) {
          cellMonth = 0;
          cellYear = viewYear + 1;
        }
      } else {
        cellDay = i - startOffset + 1;
      }

      const iso = toIsoDateString(cellYear, cellMonth, cellDay);
      const isToday = iso === todayIso;
      const isSelected = iso === selectedIso;
      const isDisabled =
        Boolean(options.minDate && iso < options.minDate) ||
        Boolean(options.maxDate && iso > options.maxDate);

      const classList = [
        'dropdown-calendar__day',
        isOutside ? 'is-outside' : '',
        isToday ? 'is-today' : '',
        isSelected ? 'is-selected' : '',
        isDisabled ? 'is-disabled' : '',
      ]
        .filter(Boolean)
        .join(' ');

      cells.push(
        `<button type="button" class="${classList}" data-ref="btn-cal-day-${escapeHtml(key)}-${iso}" data-cal-date="${iso}"${isDisabled ? ' disabled' : ''}>${cellDay}</button>`
      );
    }

    gridEl.innerHTML = cells.join('');
  };

  const applySelectedDate = (isoDate: string, closeAfter: boolean, silent = false) => {
    const parts = parseIsoDateParts(isoDate);
    selectedIso = toIsoDateString(parts.year, parts.month, parts.day);
    viewYear = parts.year;
    viewMonth = parts.month;

    const labelText = formatDateTriggerLabel(selectedIso);
    if (triggerTextEl) {
      triggerTextEl.textContent = labelText;
    }
    if (selectedInfoEl) {
      selectedInfoEl.textContent = labelText;
    }
    if (hiddenInput) {
      hiddenInput.value = selectedIso;
      if (!silent) {
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    renderCalendar();
    if (!silent && typeof options.onChange === 'function') {
      options.onChange(selectedIso);
    }
    if (closeAfter) {
      baseController.close();
    }
  };

  const baseController = setupDropdown(wrapper, {
    isSelect: false,
    matchWidth: false,
    onOpen: () => {
      const currentParts = parseIsoDateParts(selectedIso);
      viewYear = currentParts.year;
      viewMonth = currentParts.month;
      setViewMode('days');
    },
    placement: options.placement || 'bottom-start',
  });

  const onCalendarClick = (e: MouseEvent) => {
    e.stopPropagation();
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const dayBtn = target.closest<HTMLButtonElement>('[data-cal-date]');
    if (dayBtn && !dayBtn.disabled) {
      e.preventDefault();
      const iso = dayBtn.getAttribute('data-cal-date');
      if (iso) {
        applySelectedDate(iso, true);
      }
      return;
    }

    const yearBtn = target.closest<HTMLButtonElement>('[data-cal-year]');
    if (yearBtn) {
      e.preventDefault();
      const yr = Number(yearBtn.getAttribute('data-cal-year'));
      if (!isNaN(yr)) {
        viewYear = yr;
        renderCalendar();
      }
      return;
    }

    const monthBtn = target.closest<HTMLButtonElement>('[data-cal-month]');
    if (monthBtn) {
      e.preventDefault();
      const mIdx = Number(monthBtn.getAttribute('data-cal-month'));
      if (!isNaN(mIdx) && mIdx >= 0 && mIdx <= 11) {
        viewMonth = mIdx;
        setViewMode('days');
      }
      return;
    }
  };

  const onPeriodClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setViewMode(viewMode === 'days' ? 'ym' : 'days');
  };

  const onPrevClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (viewMode === 'ym') {
      viewYear -= 1;
    } else {
      viewMonth -= 1;
      if (viewMonth < 0) {
        viewMonth = 11;
        viewYear -= 1;
      }
    }
    renderCalendar();
  };

  const onNextClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (viewMode === 'ym') {
      viewYear += 1;
    } else {
      viewMonth += 1;
      if (viewMonth > 11) {
        viewMonth = 0;
        viewYear += 1;
      }
    }
    renderCalendar();
  };

  const onTodayClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setViewMode('days');
    applySelectedDate(getTodayIsoLocal(), true);
  };

  calendarRoot?.addEventListener('click', onCalendarClick);
  periodBtn?.addEventListener('click', onPeriodClick);
  prevBtn?.addEventListener('click', onPrevClick);
  nextBtn?.addEventListener('click', onNextClick);
  todayBtn?.addEventListener('click', onTodayClick);

  renderCalendar();

  return {
    close: baseController.close,
    destroy: () => {
      calendarRoot?.removeEventListener('click', onCalendarClick);
      periodBtn?.removeEventListener('click', onPeriodClick);
      prevBtn?.removeEventListener('click', onPrevClick);
      nextBtn?.removeEventListener('click', onNextClick);
      todayBtn?.removeEventListener('click', onTodayClick);
      baseController.destroy();
    },
    getValue: () => selectedIso,
    open: baseController.open,
    setValue: (isoDate: string, silent = true) => {
      applySelectedDate(isoDate, false, silent);
    },
    toggle: baseController.toggle,
    update: baseController.update,
  };
}

export { getEmptyIllustration };

