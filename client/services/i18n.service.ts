import { detectBrowserLanguage } from '../utils/languages.util.js';

let currentLanguage = 'es-419';
let currentTranslations: Record<string, unknown> = {};

const FALLBACK_TRANSLATIONS: Record<string, unknown> = {
  app: {
    loading: 'Loading...',
    name: 'ProjectBoreal',
    tagline: 'Interactive giveaways platform',
  },
  common: {
    back: 'Back',
    cancel: 'Cancel',
    close: 'Close',
    save: 'Save',
  },
  drawing: {
    desc: 'Drawing canvas and interactive winner selection.',
    title: 'Giveaway Space',
    workspace_placeholder: 'The interactive giveaway module will be rendered here.',
  },
  giveaway: {
    back_to_home: 'Back to giveaways',
    buy_now: 'Enter giveaway now',
    clear_selection: 'Clear',
    countdown_title: 'Time remaining until drawing:',
    days_short: 'days',
    draw_date: 'Draw date: {date}',
    guarantee_delivery: 'Official Delivery',
    guarantee_secure: 'Secure Payment',
    guarantee_verified: '100% Verified',
    hours_short: 'hrs',
    lucky_pick: 'Lucky Pick',
    minutes_short: 'min',
    not_found_desc: 'The requested giveaway does not exist or is no longer available.',
    not_found_title: 'Giveaway unavailable',
    per_ticket: 'per ticket',
    sales_closed_alert: 'Sales closed: Ticket sales close 1 hour before the drawing. Drawing starts shortly!',
    sales_closed_btn: 'Sales ended',
    search_ticket_placeholder: 'Search ticket number...',
    seconds_short: 'sec',
    select_tickets_subtitle: 'Click the tickets you want or use random selection',
    select_tickets_title: 'Choose your lucky numbers',
    selected_summary: '{count} tickets selected',
    ticket_status_available: 'Available',
    ticket_status_selected: 'Selected',
    ticket_status_taken: 'Sold',
    tickets_progress: '{available} of {total} tickets available',
    toast_already_taken: 'This ticket was already purchased',
    toast_buy_clicked: 'You have selected {count} tickets for ${total} {currency}. Checkout coming soon.',
    toast_lucky_picked: '{count} random tickets selected',
    toast_sales_closed: 'Ticket sales have ended for this giveaway.',
    toast_selection_cleared: 'Ticket selection cleared',
    status_completed: 'Completed',
    total_price: 'Total: ${total} {currency}',
    winner_close_modal: 'Close',
    winner_congrats_desc: 'Ticket #{ticket} was the lucky winner.',
    winner_congrats_title: '🎉 WE HAVE A WINNER!',
    winner_label: 'Winner:',
    winner_ticket_label: 'Winning ticket:',
  },
  home: {
    active_badge: 'Active',
    clear_search: 'Clear search',
    completed_badge: 'Ended',
    drawing_now: '🎉 Drawing in progress!',
    empty_giveaways: 'No giveaways available at the moment.',
    hero_title: 'What would you like to win today?',
    sales_closed_badge: 'Sales closed',
    search_aria: 'Search giveaways',
    search_btn: 'Search',
    search_placeholder: 'Search giveaways, prizes, brands...',
    searching: 'Searching: {query}',
    sold_out: 'Sold out',
    ticket_price: '${price} MXN per ticket',
    tickets_left: '{count} left',
    time_left_days: '⏳ {days}d {hours}h {minutes}m {seconds}s',
    time_left_hours: '⏳ {hours}h {minutes}m {seconds}s',
    time_left_soon: '🚨 Drawing in {minutes}:{seconds}',
    view_winner_btn: 'View Winner',
    winner_announced: 'Winner: {name} (Ticket #{ticket})',
  },
  languages: {
    en_US: 'English (United States)',
    es_419: 'Español (Latinoamérica)',
    fr_FR: 'Français (France)',
    pt_BR: 'Português (Brasil)',
  },
  nav: {
    collapse_drawer: 'Collapse menu',
    drawing: 'Giveaway',
    expand_drawer: 'Expand menu',
    home: 'Home',
    settings: 'Settings',
    toggle_drawer: 'Toggle side menu',
    validate_payment: 'Validate Payment',
  },
  orders: {
    amount_to_pay: 'Exact amount to transfer',
    back_btn: 'Back',
    bank_name_label: 'Receiving bank',
    beneficiary_label: 'Beneficiary',
    clabe_label: 'Interbank CLABE (18 digits)',
    concept_hint: 'Put your name or order reference in your banking transfer concept.',
    concept_label: 'Transfer Concept (Required)',
    continue_btn: 'Reserve and view bank details',
    copied: 'Copied to clipboard!',
    copy_amount: 'Copy Amount',
    copy_clabe: 'Copy CLABE',
    expired_notice: 'The 30-minute reservation has expired. Tickets have been released.',
    full_name_label: 'Full name',
    go_to_validate_btn: 'Validate my payment',
    modal_data_desc: 'Enter your details to register your reserved numbers.',
    modal_data_title: 'Participant Details',
    modal_reserving_desc: 'Locking your numbers for 30 minutes in the database.',
    modal_reserving_title: 'Reserving tickets...',
    payment_info_desc: 'Make your SPEI transfer before the reservation time expires.',
    payment_info_title: 'SPEI Transfer Slip',
    phone_label: 'Phone / WhatsApp (10 digits)',
    receipt_instruction: 'Save a screenshot of your transfer receipt with legible SPEI Tracking Key.',
    timer_label: 'Reservation time remaining:',
  },
  settings: {
    accessibility_group: 'Accessibility and Performance',
    extended_toasts_desc: 'Keep floating notifications on screen longer before dismissing.',
    extended_toasts_title: 'Notification duration',
    general_group: 'General preferences',
    high_contrast_desc: 'Improve readability by increasing contrast between borders, backgrounds, and text.',
    high_contrast_title: 'High contrast mode',
    language_desc: 'Choose the default language for platform texts and options.',
    language_title: 'Interface language',
    language_trigger_aria: 'Select language',
    reduce_motion_desc: 'Minimize motion and visual transition effects across the platform.',
    reduce_motion_title: 'Reduce motion',
    subtitle: 'Manage general preferences, language, appearance, and application interaction.',
    theme_dark: 'Dark mode',
    theme_desc: 'Customize visual interface by selecting light, dark, or system-synced theme.',
    theme_light: 'Light mode',
    theme_system: 'Sync with system',
    theme_title: 'Application theme',
    theme_trigger_aria: 'Select theme',
    title: 'Settings',
  },
  toasts: {
    extended_toasts_disabled: 'Standard duration restored',
    extended_toasts_enabled: 'Persistent notifications enabled',
    high_contrast_disabled: 'High contrast disabled',
    high_contrast_enabled: 'High contrast mode enabled',
    language_updated: 'Preferred language updated',
    reduce_motion_disabled: 'Normal animations restored',
    reduce_motion_enabled: 'Reduced motion enabled',
    theme_updated: 'Visual theme updated',
  },
  validate_payment: {
    drop_receipt_text: 'Drag and drop your receipt screenshot here or click to select',
    modal_upload_desc: 'Upload your transfer receipt to extract the tracking key and begin Banxico verification.',
    modal_upload_title: 'Validate SPEI Payment',
    no_orders_found: 'No purchases or reservations found for this phone number.',
    order_card_giveaway: 'Giveaway',
    order_card_status: 'Status',
    order_card_tickets: 'Tickets',
    order_card_total: 'Total',
    receipt_success: 'Receipt received. Your payment has entered the Banxico verification queue (processed in batches every 5 minutes).',
    search_btn: 'Search my tickets',
    search_placeholder: 'Enter your phone number (e.g. 5512345678)...',
    status_awaiting_draw: 'Active giveaway • Awaiting draw',
    status_cancelled: 'Cancelled',
    status_completed: 'Validated and paid',
    status_expired: 'Reservation expired',
    status_in_review: 'Under Banxico validation',
    status_not_winner: 'Giveaway ended • Did not win',
    status_pending_payment: 'Pending payment',
    status_winner: 'Official Winner!',
    submit_receipt_btn: 'Submit for Banxico verification',
    submitting_receipt: 'Uploading receipt...',
    subtitle: 'Enter your phone number to check your reserved tickets, upload transfer receipts, and track Banxico verification status.',
    time_left: 'Expires in {time}',
    title: 'Validate & Check SPEI Payments',
    tracking_key_label: 'SPEI Tracking Key',
    upload_receipt_btn: 'Upload Receipt',
    winner_badge: '★ WINNER ★',
    winner_banner_desc: "Your ticket #{ticket} won the giveaway '{title}'!",
    winner_banner_title: 'CONGRATULATIONS! YOU WON',
    winner_contact_info: 'Our team will contact you using your registered phone number to arrange official prize delivery.',
  },
};

function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object' || !path) return undefined;
  const keys = path.split('.');
  let current: any = obj;
  for (const k of keys) {
    if (current === undefined || current === null || typeof current !== 'object') {
      return undefined;
    }
    current = current[k];
  }
  return current;
}

export function t(key: string, params: Record<string, string | number> = {}): string {
  if (!key) return '';
  let val = getNestedValue(currentTranslations, key);

  if (val === undefined || val === null || val === '') {
    val = getNestedValue(FALLBACK_TRANSLATIONS, key);
  }

  if (val === undefined || val === null) {
    return key;
  }

  let result = String(val);
  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      result = result.replaceAll(`{${paramKey}}`, String(paramValue));
    });
  }

  return result;
}

export function getCurrentLanguage(): string {
  return currentLanguage;
}

async function loadTranslationFile(code: string): Promise<void> {
  try {
    const res = await fetch(`/translations/${encodeURIComponent(code)}.json`);
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      currentTranslations = (await res.json()) as Record<string, unknown>;
    } else {
      currentTranslations = {};
    }
  } catch (_) {
    currentTranslations = {};
  }
}

export async function initI18n(): Promise<void> {
  const savedLang = localStorage.getItem('boreal_language');
  const browserLang = detectBrowserLanguage();

  let code = savedLang || browserLang || 'es-419';
  if (code === 'es') code = 'es-419';
  if (code === 'en') code = 'en-US';
  if (code === 'pt') code = 'pt-BR';
  if (code === 'fr') code = 'fr-FR';

  currentLanguage = code;
  await loadTranslationFile(currentLanguage);
}

export async function setLanguage(code: string): Promise<void> {
  if (!code) return;
  currentLanguage = code;
  localStorage.setItem('boreal_language', code);

  await loadTranslationFile(code);
  translateElement(document.body);
  window.dispatchEvent(new CustomEvent('languagechange', { detail: { language: code } }));
}

export function translateElement(rootEl: HTMLElement): HTMLElement {
  if (!rootEl || !(rootEl instanceof HTMLElement)) return rootEl;

  const processNode = (el: HTMLElement) => {
    const i18nKey = el.getAttribute('data-i18n');
    if (i18nKey) {
      el.textContent = t(i18nKey);
    }

    const i18nHtmlKey = el.getAttribute('data-i18n-html');
    if (i18nHtmlKey) {
      el.innerHTML = t(i18nHtmlKey);
    }

    const i18nPlaceholderKey = el.getAttribute('data-i18n-placeholder');
    if (i18nPlaceholderKey) {
      el.setAttribute('placeholder', t(i18nPlaceholderKey));
    }

    const i18nTooltipKey = el.getAttribute('data-i18n-tooltip');
    if (i18nTooltipKey) {
      el.setAttribute('data-tooltip', t(i18nTooltipKey));
    }

    const i18nAriaKey = el.getAttribute('data-i18n-aria');
    if (i18nAriaKey) {
      el.setAttribute('aria-label', t(i18nAriaKey));
    }

    const i18nTitleKey = el.getAttribute('data-i18n-title');
    if (i18nTitleKey) {
      el.setAttribute('title', t(i18nTitleKey));
    }
  };

  processNode(rootEl);
  const elements = rootEl.querySelectorAll<HTMLElement>(
    '[data-i18n], [data-i18n-html], [data-i18n-placeholder], [data-i18n-tooltip], [data-i18n-aria], [data-i18n-title]'
  );
  elements.forEach(processNode);

  return rootEl;
}
