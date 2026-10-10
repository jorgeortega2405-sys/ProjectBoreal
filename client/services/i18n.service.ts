let currentLanguage = 'es-MX';
let currentTranslations: Record<string, unknown> = {};

const FALLBACK_TRANSLATIONS: Record<string, unknown> = {
  app: {
    loading: 'Cargando...',
    name: 'ProjectBoreal',
    tagline: 'Plataforma de sorteos interactivos',
  },
  common: {
    back: 'Volver',
    cancel: 'Cancelar',
    close: 'Cerrar',
    continue: 'Continuar',
    save: 'Guardar',
  },
  daily: {
    badge_frequency: 'Lunes a Viernes',
    badge_title: 'Sorteo Diario 10k',
    buy_btn: 'Elegir Boletos • $5 c/u',
    closing_monday: 'Cierre el Lunes a las 20:00 hrs',
    closing_today: 'Cierre hoy a las 20:00 hrs',
    countdown_label: 'Tiempo restante',
    drawing_in_progress: '¡Sorteo en curso!',
    empty_winners: '¡El próximo ganador podrías ser tú! Participa por solo $5 MXN.',
    hours_label: 'Horas',
    minutes_label: 'Min',
    next_cycle_note: 'Al concluir, el siguiente sorteo inicia inmediatamente.',
    prize_amount: '$10,000 MXN en Efectivo',
    prize_subtitle: '10,000 boletos a solo $5 MXN cada uno',
    recent_winners_title: 'Últimos 5 Ganadores',
    seconds_label: 'Seg',
    tickets_progress: '{available} de {total} boletos disponibles',
    view_all_winners: 'Ver todos los ganadores',
  },
  drawing: {
    desc: 'Lienzo de dibujo y selección interactiva de ganadores.',
    no_active_drawing_title: 'Espacio de Sorteo',
    title: 'Espacio de Sorteo',
    workspace_placeholder: 'Actualmente no hay ninguna extracción o sorteo en vivo.',
  },
  giveaway: {
    back_to_home: 'Volver al inicio',
    buy_now: 'Participar ahora',
    clear_selection: 'Limpiar',
    countdown_title: 'Tiempo restante para el sorteo:',
    daily_badge: 'Sorteo Diario',
    daily_draw_date: '{date} • {time} hrs',
    daily_draw_today: 'Hoy {time} hrs',
    daily_pot_desc_date: 'El ganador se lleva el {pct}% del acumulado de boletos. Sorteo automático el {date} a las {time} hrs.',
    daily_pot_desc_today: 'El ganador se lleva el {pct}% del acumulado de boletos de hoy. Sorteo automático hoy a las {time} hrs.',
    daily_pot_pill: 'Bolsa Acumulada',
    days_short: 'días',
    disclaimer_illustrative: '* Imagen con fines ilustrativos. La entrega o presentación final puede diferir de la imagen mostrada.',
    draw_date: 'Fecha del sorteo: {date}',
    gallery_photo_aria: 'Foto {index}',
    gallery_thumb_alt: 'Miniatura {index}',
    generate_tickets: 'Generar boletos',
    guarantee_delivery: 'Entrega Oficial',
    guarantee_secure: 'Pago Seguro',
    guarantee_verified: '100% Verificado',
    hours_short: 'hrs',
    lucky_pick: 'Al azar',
    minutes_short: 'min',
    n_tickets: '{count} boletos',
    next_page: 'Página siguiente',
    no_winner_banner_desc: 'Este sorteo finalizó sin boletos adquiridos. La bolsa o premio no fue reclamado.',
    no_winner_banner_title: 'Sorteo Concluido Sin Participantes',
    no_winner_modal_desc: 'El tiempo oficial de este sorteo ha finalizado sin boletos registrados, por lo que el premio no fue asignado.',
    no_winner_modal_title: 'Sorteo Concluido Sin Participantes',
    no_winner_status_badge: 'Sin boletos registrados',
    no_winner_status_detail: 'No se registraron participantes antes del cierre oficial.',
    no_winner_status_label: 'ESTADO DEL SORTEO',
    not_found_desc: 'El sorteo solicitado no existe o ya no se encuentra disponible.',
    not_found_title: 'Sorteo no disponible',
    one_ticket: '1 boleto',
    pending_order_banner_title: 'Tienes boletos apartados pendientes de pago',
    pending_order_remaining: '{time} restantes',
    pending_order_summary: '{count} boletos apartados ({amount})',
    pending_order_upload_receipt: 'Subir comprobante',
    pending_order_view_accounts: 'Ver cuentas',
    per_ticket: 'por boleto',
    prev_page: 'Página anterior',
    sales_closed_alert: 'Venta cerrada: La compra de boletos se cierra 1 hora antes del sorteo. ¡El sorteo comenzará en breve!',
    sales_closed_btn: 'Venta finalizada',
    search_ticket_placeholder: 'Buscar número de boleto...',
    seconds_short: 'seg',
    select_tickets_subtitle: 'Haz clic en los números que desees o utiliza la selección al azar',
    select_tickets_title: 'Elige tus números de la suerte',
    selected_summary: '{count} boletos seleccionados',
    selected_summary_one: '1 boleto seleccionado',
    status_completed: 'Finalizado',
    ticket_status_available: 'Disponible',
    ticket_status_selected: 'Seleccionado',
    ticket_status_taken: 'Ocupado',
    tickets_progress: '{available} de {total} boletos disponibles',
    toast_already_taken: 'Este boleto ya fue adquirido',
    toast_buy_clicked: 'Has seleccionado {count} boletos por ${total} {currency}. Compra próximamente.',
    toast_lucky_picked: 'Se han elegido {count} boletos al azar',
    toast_max_tickets: 'No puedes seleccionar más de {max} boletos por orden.',
    toast_sales_closed: 'La venta de boletos ha finalizado para este sorteo.',
    toast_selection_cleared: 'Selección de boletos eliminada',
    total_price: 'Total: ${total} {currency}',
    trust_crypto_desc: 'La determinación del folio ganador se ejecuta mediante un generador pseudoaleatorio criptográficamente seguro (CSPRNG) con entropía de grado industrial. Cada evento de selección calcula un identificador determinista SHA-256 que vincula de manera inalterable la semilla de aleatoriedad con el boleto premiado, eliminando cualquier intervención o manipulación humana y garantizando un proceso 100% auditable y transparente.',
    trust_crypto_summary: 'Algoritmo determinista CSPRNG de alta entropía con sellado inmutable SHA-256 para total imparcialidad.',
    trust_crypto_title: 'Protocolo Criptográfico de Selección Verificable',
    trust_whatsapp_desc: 'Al concluir el evento, la notificación oficial y el protocolo de asignación se realizan exclusivamente a través de nuestra cuenta corporativa verificada de WhatsApp hacia el número de telefonía móvil de 10 dígitos registrado en la orden. Nuestro equipo de cumplimiento y entrega coordina la validación de identidad sin solicitar contraseñas, pagos de liberación ni comisiones adicionales de ningún tipo.',
    trust_whatsapp_summary: 'Contacto institucional directo vía WhatsApp Empresarial al número telefónico validado de tu orden.',
    trust_whatsapp_title: 'Canal Corporativo Oficial y Acreditación de Titularidad',
    winner_close_modal: 'Cerrar',
    winner_congrats_desc: 'El boleto #{ticket} ha sido el elegido de la suerte.',
    winner_congrats_title: '🎉 ¡TENEMOS UN GANADOR!',
    winner_label: 'Ganador(a):',
    winner_ticket_label: 'Boleto premiado:',
  },
  home: {
    active_badge: 'Activo',
    clear_search: 'Limpiar búsqueda',
    completed_badge: 'Finalizado',
    drawing_now: '¡Sorteo en curso!',
    empty_giveaways: 'No se encontraron sorteos disponibles.',
    hero_title: '¿Qué te gustaría ganar hoy?',
    sales_closed_badge: 'Venta cerrada',
    search_aria: 'Buscar sorteos',
    search_btn: 'Buscar',
    search_placeholder: 'Buscar sorteos, premios, marcas...',
    searching: 'Buscando: {query}',
    sold_out: 'Agotado',
    ticket_price: '${price} MXN por boleto',
    tickets_left: '{count} disponibles',
    time_left_days: '{days}d {hours}h {minutes}m {seconds}s',
    time_left_hours: '{hours}h {minutes}m {seconds}s',
    time_left_soon: 'Sorteo en {minutes}:{seconds}',
    view_winner_btn: 'Ver Ganador',
    winner_announced: 'Ganador: {name} (Boleto #{ticket})',
  },
  languages: {
    es_MX: 'Español (México)',
  },
  nav: {
    collapse_drawer: 'Contraer menú',
    cookies: 'Política de Cookies',
    drawing: 'Sorteo',
    expand_drawer: 'Expandir menú',
    faq: 'Preguntas Frecuentes',
    help: 'Ayuda',
    home: 'Inicio',
    legal_policies: 'Políticas y Legal',
    more: 'Más',
    navigation: 'Navegación',
    prizes: 'Entrega de Premios',
    privacy: 'Política de Privacidad',
    responsible_gaming: 'Juego Responsable',
    rules: 'Reglas del Sorteo',
    settings: 'Configuración',
    terms: 'Términos y Condiciones',
    toggle_drawer: 'Alternar menú lateral',
    validate_payment: 'Boletos',
    winners: 'Resultados',
  },
  orders: {
    amount_to_pay: 'Monto exacto a transferir',
    authorized_accounts_desc: 'Transfiere el monto exacto a cualquiera de las siguientes cuentas:',
    authorized_accounts_title: 'Cuentas bancarias autorizadas',
    back_btn: 'Atrás',
    bank_name_label: 'Banco receptor',
    bank_warning_desc: 'Si alguna tarjeta o cuenta bancaria se encuentra saturada o no te permite transferir, por favor intenta con cualquiera de las otras cuentas disponibles.',
    bank_warning_title: 'Aviso de saturación bancaria',
    beneficiary_label: 'Beneficiario',
    card_number_label: 'Número de tarjeta para depósito',
    clabe_label: 'CLABE interbancaria (18 dígitos)',
    concept_hint: 'Coloca tu nombre oficial en el concepto o motivo de tu transferencia bancaria.',
    concept_label: 'Concepto / Referencia (Tu nombre completo)',
    continue_btn: 'Continuar',
    copied: '¡Copiado al portapapeles!',
    copy_amount: 'Copiar Monto',
    copy_card: 'Copiar Tarjeta',
    copy_clabe: 'Copiar CLABE',
    copy_concept: 'Copiar concepto',
    empty_accounts_notice: 'No hay cuentas bancarias activas registradas en este sorteo. Por favor contacta al organizador.',
    err_city_required: 'Selecciona tu ciudad o municipio.',
    err_name_required: 'Ingresa tu nombre completo para continuar.',
    err_phone_intl_invalid: 'Ingresa un número telefónico válido (entre 7 y 15 dígitos).',
    err_phone_mex_invalid: 'Ingresa un número celular válido de 10 dígitos.',
    err_reserve_failed: 'No fue posible apartar los boletos.',
    err_state_required: 'Selecciona tu estado de la República.',
    expired_notice: 'El tiempo de apartado de 30 minutos ha expirado. Los boletos han sido liberados.',
    full_name_label: 'Nombre completo',
    go_to_validate_btn: 'Validar mi pago',
    modal_data_desc: 'Ingresa tus datos para registrar tus números apartados.',
    modal_data_title: 'Tus datos de participante',
    modal_reserving_desc: 'Bloqueando tus números por 30 minutos en la base de datos.',
    modal_reserving_title: 'Apartando boletos...',
    payment_info_desc: 'Realiza tu transferencia SPEI antes de que expire el tiempo de apartado.',
    payment_info_title: 'Ficha de Transferencia SPEI',
    phone_label: 'Teléfono / WhatsApp (10 dígitos)',
    receipt_instruction: 'Al realizar tu transferencia, coloca tu nombre completo en el concepto o motivo de pago. Guarda la captura de tu comprobante.',
    select_city_placeholder: 'Selecciona tu ciudad / municipio',
    select_state_placeholder: 'Selecciona tu estado',
    state_label: 'Estado de la República',
    timer_label: 'Tiempo restante de apartado:',
  },
  settings: {
    accessibility_group: 'Accesibilidad y Rendimiento',
    extended_toasts_desc: 'Mantén las notificaciones flotantes durante más tiempo en pantalla antes de descartarse.',
    extended_toasts_title: 'Duración de notificaciones',
    general_group: 'Preferencias generales',
    high_contrast_desc: 'Mejora la legibilidad aumentando el contraste entre bordes, fondos y textos.',
    high_contrast_title: 'Modo de alto contraste',
    language_desc: 'Elige el idioma predeterminado para los textos y opciones de la plataforma.',
    language_title: 'Idioma de la interfaz',
    language_trigger_aria: 'Seleccionar idioma',
    reduce_motion_desc: 'Minimiza el movimiento y efectos visuales de transición en toda la plataforma.',
    reduce_motion_title: 'Reducir animaciones',
    subtitle: 'Gestiona las preferencias generales, idioma, apariencia e interacción de la aplicación.',
    theme_dark: 'Modo oscuro',
    theme_desc: 'Personaliza la interfaz visual seleccionando un tema claro, oscuro o sincronizado con el sistema.',
    theme_light: 'Modo claro',
    theme_system: 'Sincronizar con el sistema',
    theme_title: 'Tema de la aplicación',
    theme_trigger_aria: 'Seleccionar tema',
    title: 'Configuración',
  },
  toasts: {
    extended_toasts_disabled: 'Duración estándar restaurada',
    extended_toasts_enabled: 'Notificaciones persistentes activadas',
    high_contrast_disabled: 'Alto contraste desactivado',
    high_contrast_enabled: 'Modo de alto contraste activado',
    language_updated: 'Idioma preferido actualizado',
    reduce_motion_disabled: 'Animaciones normales restauradas',
    reduce_motion_enabled: 'Animaciones reducidas activadas',
    theme_updated: 'Tema visual actualizado',
  },
  validate_payment: {
    drop_receipt_text: 'Arrastra la captura del comprobante aquí o haz clic para subir imagen',
    err_order_not_found: 'La orden especificada no fue encontrada.',
    err_phone_invalid: 'Ingresa un número celular válido para buscar tus boletos.',
    err_select_receipt: 'Por favor selecciona una imagen del comprobante bancario.',
    err_upload_failed: 'Error al enviar comprobante.',
    estimated_validation_time: 'Tiempo estimado de validación: 5 a 15 minutos una vez recibido tu comprobante. Nuestro sistema verifica automáticamente tus transferencias SPEI.',
    modal_upload_desc: 'Sube el comprobante de tu transferencia para extraer la clave de rastreo e iniciar la validación con Banxico.',
    modal_upload_summary: 'Participante: {name} • Monto: {amount}',
    modal_upload_title: 'Validar Pago SPEI',
    no_orders_found: 'No se encontraron apartados ni compras con este número de teléfono.',
    no_orders_title: 'Sin boletos registrados',
    order_card_giveaway: 'Sorteo',
    order_card_status: 'Estado',
    order_card_tickets: 'Boletos',
    order_card_total: 'Total',
    participant_label: 'Participante: {name}',
    receipt_alt: 'Comprobante',
    receipt_success: 'Comprobante recibido. Tu pago ha entrado en la cola de validación Banxico (procesada por lotes cada 5 minutos).',
    reserved_tickets_label: 'Boletos apartados ({count}):',
    review_note: 'Comprobante recibido y en proceso de validación Banxico. Tiempo estimado de confirmación: 5 a 15 minutos.',
    search_btn: 'Buscar mis boletos',
    search_placeholder: 'Ingresa tu número de teléfono (ej. 5512345678)...',
    status_awaiting_draw: 'Sorteo activo • Esperando sorteo',
    status_cancelled: 'Cancelado',
    status_completed: 'Validado y pagado',
    status_expired: 'Apartado expirado',
    status_in_review: 'En validación Banxico',
    status_not_winner: 'Sorteo finalizado • No resultó ganador',
    status_pending_payment: 'Pendiente de pago',
    status_winner: '¡Ganador oficial!',
    submit_receipt_btn: 'Enviar a validación Banxico',
    submitting_receipt: 'Subiendo comprobante...',
    subtitle: 'Ingresa tu número de teléfono para revisar tus boletos apartados, subir comprobantes y dar seguimiento al estado de validación con Banxico.',
    time_left: 'Expira en {time}',
    title: 'Validar y Consultar Pagos SPEI',
    total_label: 'Total:',
    tracking_key_label: 'Clave de Rastreo SPEI',
    upload_receipt_btn: 'Subir Comprobante',
    view_accounts_btn: 'Ver cuentas de pago',
    winner_badge: '★ GANADOR ★',
    winner_banner_desc: "¡Tu boleto #{ticket} fue el seleccionado en el sorteo '{title}'!",
    winner_banner_title: '¡FELICIDADES! ERES EL GANADOR',
    winner_contact_info: 'Nuestro equipo se pondrá en contacto contigo a través de tu número telefónico registrado para coordinar la entrega oficial de tu premio.',
  },
  winners: {
    clear_search: 'Limpiar búsqueda',
    col_date: 'Fecha',
    col_giveaway: 'Sorteo',
    col_location: 'Ubicación',
    col_phone: 'Teléfono',
    col_prize: 'Premio Ganado',
    col_ticket: 'Boleto',
    col_winner: 'Ganador',
    default_country: 'México',
    default_participant: 'Participante',
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
    search_no_results_desc: 'No se encontraron sorteos o ganadores que coincidan con tu búsqueda.',
    search_no_results_title: 'Sin resultados',
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
  } catch {
    currentTranslations = {};
  }
}

export async function initI18n(): Promise<void> {
  const savedLang = localStorage.getItem('boreal_language') || localStorage.getItem('boreal_lang') || 'es-MX';
  await setLanguage(savedLang);
}

export async function setLanguage(code: string): Promise<void> {
  if (!code) return;
  currentLanguage = code;
  try {
    localStorage.setItem('boreal_language', code);
    localStorage.setItem('boreal_lang', code);
  } catch {}

  await loadTranslationFile(code);
  translateElement(document.body);
  window.dispatchEvent(new CustomEvent('languagechange', { detail: { lang: code, language: code } }));
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
