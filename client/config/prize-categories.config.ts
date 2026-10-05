import { t } from '../services/i18n.service.js';
import { Giveaway } from '../types/giveaway.types.js';

export interface PrizeCategoryItem {
  dataRef: string;
  i18nKey: string;
  iconSvg: string;
  id: string;
  label: string;
}

const SVG_ATTRIBUTES = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

export const PRIZE_CATEGORY_ICONS: Record<string, string> = {
  all: `<svg class="component-icon" ${SVG_ATTRIBUTES}><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
  cash: `<svg class="component-icon" ${SVG_ATTRIBUTES}><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>`,
  computers: `<svg class="component-icon" ${SVG_ATTRIBUTES}><path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/></svg>`,
  gaming: `<svg class="component-icon" ${SVG_ATTRIBUTES}><rect width="20" height="12" x="2" y="6" rx="6"/><path d="M6 12h4m-2-2v4m7-2h.01m3 0h.01"/></svg>`,
  home_appliances: `<svg class="component-icon" ${SVG_ATTRIBUTES}><rect width="20" height="15" x="2" y="4" rx="2"/><path d="M17 19v2M7 19v2m0 0h10"/></svg>`,
  luxury: `<svg class="component-icon" ${SVG_ATTRIBUTES}><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M11 3 8 9l4 12 4-12-3-6M2 9h20"/></svg>`,
  tech: `<svg class="component-icon" ${SVG_ATTRIBUTES}><rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/></svg>`,
  travel: `<svg class="component-icon" ${SVG_ATTRIBUTES}><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`,
  vehicles: `<svg class="component-icon" ${SVG_ATTRIBUTES}><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10l-2-4H7L5 10s-2.7.6-4.5 1.1C-.3 11.3 0 12.1 0 13v3c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>`,
};

export const PRIZE_CATEGORIES: PrizeCategoryItem[] = [
  {
    dataRef: 'cat-badge-all',
    i18nKey: 'home.cat_all',
    iconSvg: PRIZE_CATEGORY_ICONS.all,
    id: 'all',
    label: 'Todos',
  },
  {
    dataRef: 'cat-badge-gaming',
    i18nKey: 'home.cat_gaming',
    iconSvg: PRIZE_CATEGORY_ICONS.gaming,
    id: 'gaming',
    label: 'Gaming',
  },
  {
    dataRef: 'cat-badge-tech',
    i18nKey: 'home.cat_tech',
    iconSvg: PRIZE_CATEGORY_ICONS.tech,
    id: 'tech',
    label: 'Tecnología',
  },
  {
    dataRef: 'cat-badge-computers',
    i18nKey: 'home.cat_computers',
    iconSvg: PRIZE_CATEGORY_ICONS.computers,
    id: 'computers',
    label: 'Cómputo',
  },
  {
    dataRef: 'cat-badge-vehicles',
    i18nKey: 'home.cat_vehicles',
    iconSvg: PRIZE_CATEGORY_ICONS.vehicles,
    id: 'vehicles',
    label: 'Vehículos',
  },
  {
    dataRef: 'cat-badge-cash',
    i18nKey: 'home.cat_cash',
    iconSvg: PRIZE_CATEGORY_ICONS.cash,
    id: 'cash',
    label: 'Efectivo',
  },
  {
    dataRef: 'cat-badge-travel',
    i18nKey: 'home.cat_travel',
    iconSvg: PRIZE_CATEGORY_ICONS.travel,
    id: 'travel',
    label: 'Viajes',
  },
  {
    dataRef: 'cat-badge-home-appliances',
    i18nKey: 'home.cat_home_appliances',
    iconSvg: PRIZE_CATEGORY_ICONS.home_appliances,
    id: 'home_appliances',
    label: 'Hogar',
  },
  {
    dataRef: 'cat-badge-luxury',
    i18nKey: 'home.cat_luxury',
    iconSvg: PRIZE_CATEGORY_ICONS.luxury,
    id: 'luxury',
    label: 'Lujo',
  },
];

export function getGiveawayCategory(giveaway: Giveaway): PrizeCategoryItem {
  const text = `${giveaway.title} ${giveaway.slug} ${giveaway.description || ''}`.toLowerCase();

  if (/playstation|ps5|xbox|nintendo|switch|gamer|rtx|consola|videojuego/.test(text)) {
    return PRIZE_CATEGORIES.find((c) => c.id === 'gaming')!;
  }
  if (/macbook|laptop|computadora|notebook|pc/.test(text)) {
    return PRIZE_CATEGORIES.find((c) => c.id === 'computers')!;
  }
  if (/iphone|samsung|galaxy|smartphone|celular|ipad|tablet|camara|cámara|sony alpha/.test(text)) {
    return PRIZE_CATEGORIES.find((c) => c.id === 'tech')!;
  }
  if (/moto|motocicleta|yamaha|auto|carro|coche|camioneta|vehiculo|vehículo|bmw/.test(text)) {
    return PRIZE_CATEGORIES.find((c) => c.id === 'vehicles')!;
  }
  if (/efectivo|dinero|cash|pesos|transferencia/.test(text)) {
    return PRIZE_CATEGORIES.find((c) => c.id === 'cash')!;
  }
  if (/viaje|tokio|japon|japón|cancun|cancún|paris|parís|vuelo|hotel|playa/.test(text)) {
    return PRIZE_CATEGORIES.find((c) => c.id === 'travel')!;
  }
  if (/pantalla|oled|televisor|tv|bose|audio|sonido|refrigerador|electrodoméstico/.test(text)) {
    return PRIZE_CATEGORIES.find((c) => c.id === 'home_appliances')!;
  }
  if (/rolex|reloj|joya|oro|diamante|lujo/.test(text)) {
    return PRIZE_CATEGORIES.find((c) => c.id === 'luxury')!;
  }

  return PRIZE_CATEGORIES.find((c) => c.id === 'tech')!;
}

export function renderPrizeCategoryBadgesHtml(activeCategory = 'all'): string {
  return PRIZE_CATEGORIES.map((item) => {
    const activeClass = item.id === activeCategory ? ' is-active' : '';
    const labelText = t(item.i18nKey) || item.label;
    return `<button type="button" class="component-badge component-badge--interactive${activeClass}" data-ref="${item.dataRef}" data-category="${item.id}" data-i18n-aria="${item.i18nKey}" aria-label="${labelText}">
  ${item.iconSvg}
  <span data-i18n="${item.i18nKey}">${labelText}</span>
</button>`;
  }).join('\n');
}
