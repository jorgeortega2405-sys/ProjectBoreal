import { detectBrowserLanguage } from '../utils/languages.util.js';

let currentLanguage = 'es-MX';
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
  daily: {
    badge_frequency: 'Lunes a Viernes',
    badge_title: 'Sorteo Diario',
    buy_btn: 'Jugar Ahora ($2 MXN)',
    closing_monday: 'Venta cierra 1 hora antes (22:59 hrs)',
    closing_today: 'Venta cierra 1 hora antes (22:59 hrs)',
    countdown_label: 'Cierre y Sorteo Oficial en:',
    drawing_in_progress: '¡Sorteo en curso! Seleccionando ganador...',
    empty_winners: 'Sé el primer ganador de hoy',
    hours_label: 'Horas',
    live_pot_badge: 'Bolsa En Vivo',
    minutes_label: 'Minutos',
    pot_label: 'Bolsa Acumulada Hoy',
    prize_amount: '${amount} MXN',
    prize_subtitle: '¡El ganador se lleva una parte del acumulado de hoy! Boletos a solo $2 MXN.',
    recent_winners_title: 'Últimos Ganadores',
    seconds_label: 'Segundos',
    tickets_progress: '{available} de {total} boletos disponibles',
    view_all_winners: 'Ver todos',
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
    trust_crypto_title: 'Verifiable Cryptographic Selection Protocol',
    trust_crypto_summary: 'High-entropy CSPRNG deterministic algorithm with immutable SHA-256 sealing for absolute impartiality.',
    trust_crypto_desc: 'Winning ticket determination is executed via an industry-grade cryptographically secure pseudorandom number generator (CSPRNG). Each drawing generates a deterministic SHA-256 identifier binding the random seed to the winning ticket, eliminating any human intervention or manipulation while ensuring full auditability and transparency.',
    trust_whatsapp_title: 'Official Corporate Channel & Identity Verification',
    trust_whatsapp_summary: 'Direct institutional communication via WhatsApp Enterprise to the verified phone number on your order.',
    trust_whatsapp_desc: 'Upon conclusion of the event, official notification and award allocation are conducted exclusively through our verified WhatsApp Business corporate line to the 10-digit mobile number registered on the order. Our compliance and delivery team coordinates identity verification without requesting passwords, clearance fees, or additional transfers.',
    no_winner_banner_desc: 'This giveaway ended with no tickets purchased. The prize was not claimed.',
    no_winner_banner_title: 'Giveaway Ended Without Participants',
    no_winner_modal_desc: 'The official time for this giveaway has ended with no tickets registered, so the prize was not awarded.',
    no_winner_modal_title: 'Giveaway Ended Without Participants',
    no_winner_status_badge: 'No registered tickets',
    no_winner_status_detail: 'No participants registered before the official closing time.',
    no_winner_status_label: 'GIVEAWAY STATUS',
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
    continue_btn: 'Continue',
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
    estimated_validation_time: 'Estimated validation time: 5 to 15 minutes once your receipt is received. Our system verifies your SPEI transfers automatically.',
    modal_upload_desc: 'Upload your transfer receipt to extract the tracking key and begin Banxico verification.',
    modal_upload_title: 'Validate SPEI Payment',
    no_orders_found: 'No purchases or reservations found for this phone number.',
    order_card_giveaway: 'Giveaway',
    order_card_status: 'Status',
    order_card_tickets: 'Tickets',
    order_card_total: 'Total',
    receipt_success: 'Receipt received. Your payment has entered the Banxico verification queue (processed in batches every 5 minutes).',
    review_note: 'Receipt received and in Banxico validation queue. Estimated confirmation time: 5 to 15 minutes.',
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
    view_accounts_btn: 'View Bank Accounts',
    winner_badge: '★ WINNER ★',
    winner_banner_desc: "Your ticket #{ticket} won the giveaway '{title}'!",
    winner_banner_title: 'CONGRATULATIONS! YOU WON',
    winner_contact_info: 'Our team will contact you using your registered phone number to arrange official prize delivery.',
  },
  winners: {
    clear_search: 'Limpiar búsqueda',
    delivery_guarantee: '100% Entregas Garantizadas',
    delivery_location: 'Ubicación de Entrega',
    draw_date_label: 'Fecha del Sorteo',
    empty_desc: 'Los ganadores de nuestros sorteos activos aparecerán aquí inmediatamente después de la selección oficial y la entrega.',
    empty_title: 'Aún no hay sorteos concluidos',
    hero_subtitle: 'Transparencia total. Consulta los sorteos concluidos, números de boletos premiados y evidencia de entrega de premios.',
    hero_title: 'Ganadores y Entregas Oficiales',
    no_results: 'No se encontraron sorteos o ganadores que coincidan con tu búsqueda.',
    official_winner: 'Ganador Oficial',
    search_aria: 'Buscar entre los ganadores y entregas',
    search_placeholder: 'Buscar por sorteo, ganador o número de boleto...',
    stat_guarantee: 'Legalidad y Fe Pública',
    stat_prizes_awarded: 'Total en Premios',
    stat_total_winners: 'Ganadores Oficiales',
    ticket_label: 'Boleto Ganador',
    verified_badge: 'Entrega Verificada',
    view_giveaway: 'Ver Sorteo',
    winner_label: 'Ganador(a)',
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

  let code = savedLang || browserLang || 'es-MX';
  if (code !== 'es-MX') code = 'es-MX';

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
