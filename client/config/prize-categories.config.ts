import { t } from '../services/i18n.service.js';
import { Giveaway } from '../types/giveaway.types.js';

export interface PrizeCategoryItem {
  dataRef: string;
  i18nKey: string;
  iconSvg: string;
  id: string;
  label: string;
}

export const PRIZE_CATEGORY_ICONS: Record<string, string> = {
  all: '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#grid_view"></use></svg>',
  cash: '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#paid"></use></svg>',
  computers: '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#laptop_mac"></use></svg>',
  gaming: '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#sports_esports"></use></svg>',
  home_appliances: '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#home"></use></svg>',
  luxury: '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#diamond"></use></svg>',
  tech: '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#devices"></use></svg>',
  travel: '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#flight_takeoff"></use></svg>',
  vehicles: '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#directions_car"></use></svg>',
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
