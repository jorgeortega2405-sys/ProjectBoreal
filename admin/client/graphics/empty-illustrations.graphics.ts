export type EmptyIllustrationKey =
  | 'customers'
  | 'dashboard'
  | 'default'
  | 'giveaways'
  | 'orders'
  | 'payments'
  | 'search'
  | 'users'
  | 'winners';

export const EMPTY_ILLUSTRATIONS: Record<string, string> = {
  customers: `<svg class="component-empty-state-svg" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="illCustGradMain" x1="35" y1="35" x2="105" y2="105" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#52525b"/>
        <stop offset="50%" stop-color="#3f3f46"/>
        <stop offset="100%" stop-color="#27272a"/>
      </linearGradient>
      <linearGradient id="illCustGradBack" x1="30" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#3f3f46"/>
        <stop offset="100%" stop-color="#18181b"/>
      </linearGradient>
    </defs>
    <g opacity="0.6">
      <circle cx="48" cy="46" r="14" fill="url(#illCustGradBack)" stroke="#52525b" stroke-width="1.5"/>
      <path d="M28 84 C28 70 38 68 48 68 C58 68 68 70 68 84 Z" fill="url(#illCustGradBack)" stroke="#52525b" stroke-width="1.5"/>
    </g>
    <g opacity="0.6">
      <circle cx="92" cy="46" r="14" fill="url(#illCustGradBack)" stroke="#52525b" stroke-width="1.5"/>
      <path d="M72 84 C72 70 82 68 92 68 C102 68 112 70 112 84 Z" fill="url(#illCustGradBack)" stroke="#52525b" stroke-width="1.5"/>
    </g>
    <circle cx="70" cy="50" r="18" fill="url(#illCustGradMain)" stroke="#71717a" stroke-width="2"/>
    <circle cx="70" cy="46" r="6" fill="#e4e4e7" opacity="0.8"/>
    <path d="M44 98 C44 80 56 76 70 76 C84 76 96 80 96 98 Z" fill="url(#illCustGradMain)" stroke="#71717a" stroke-width="2"/>
    <rect x="62" y="82" width="16" height="4" rx="2" fill="#e4e4e7" opacity="0.5"/>
    <g>
      <path d="M116 28 L117.5 32.5 L122 34 L117.5 35.5 L116 40 L114.5 35.5 L110 34 L114.5 32.5 Z" fill="#e4e4e7"/>
      <path d="M22 46 L23 49 L26 50 L23 51 L22 54 L21 51 L18 50 L21 49 Z" fill="#a1a1aa"/>
      <path d="M102 96 L103 98 L105 99 L103 100 L102 102 L101 100 L99 99 L101 98 Z" fill="#71717a"/>
    </g>
  </svg>`,

  dashboard: `<svg class="component-empty-state-svg" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="illDashGrad" x1="25" y1="25" x2="115" y2="115" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#52525b"/>
        <stop offset="50%" stop-color="#3f3f46"/>
        <stop offset="100%" stop-color="#27272a"/>
      </linearGradient>
    </defs>
    <rect x="25" y="25" width="40" height="40" rx="8" fill="url(#illDashGrad)" stroke="#71717a" stroke-width="1.5"/>
    <rect x="75" y="25" width="40" height="25" rx="8" fill="url(#illDashGrad)" stroke="#71717a" stroke-width="1.5"/>
    <rect x="75" y="60" width="40" height="55" rx="8" fill="url(#illDashGrad)" stroke="#71717a" stroke-width="1.5"/>
    <rect x="25" y="75" width="40" height="40" rx="8" fill="url(#illDashGrad)" stroke="#71717a" stroke-width="1.5"/>
    <g>
      <path d="M116 24 L117.5 28.5 L122 30 L117.5 31.5 L116 36 L114.5 31.5 L110 30 L114.5 28.5 Z" fill="#e4e4e7"/>
    </g>
  </svg>`,

  default: `<svg class="component-empty-state-svg" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="illDefGrad" x1="30" y1="30" x2="110" y2="110" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#52525b"/>
        <stop offset="50%" stop-color="#3f3f46"/>
        <stop offset="100%" stop-color="#18181b"/>
      </linearGradient>
    </defs>
    <circle cx="70" cy="70" r="42" fill="url(#illDefGrad)" stroke="#71717a" stroke-width="2"/>
    <path d="M52 70h36M70 52v36" stroke="#e4e4e7" stroke-width="2.5" stroke-linecap="round"/>
    <g>
      <path d="M116 26 L117.5 30.5 L122 32 L117.5 33.5 L116 38 L114.5 33.5 L110 32 L114.5 30.5 Z" fill="#e4e4e7"/>
    </g>
  </svg>`,

  payments: `<svg class="component-empty-state-svg" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="illPayDocGrad" x1="28" y1="28" x2="98" y2="108" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#52525b"/>
        <stop offset="50%" stop-color="#3f3f46"/>
        <stop offset="100%" stop-color="#18181b"/>
      </linearGradient>
      <linearGradient id="illPayCardGrad" x1="45" y1="45" x2="115" y2="105" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#71717a"/>
        <stop offset="50%" stop-color="#52525b"/>
        <stop offset="100%" stop-color="#27272a"/>
      </linearGradient>
      <linearGradient id="illCoinGrad" x1="24" y1="84" x2="48" y2="108" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#fbbf24"/>
        <stop offset="100%" stop-color="#d97706"/>
      </linearGradient>
    </defs>
    <rect x="32" y="24" width="56" height="74" rx="8" fill="url(#illPayDocGrad)" stroke="#52525b" stroke-width="1.5"/>
    <line x1="42" y1="38" x2="78" y2="38" stroke="#71717a" stroke-width="2" stroke-linecap="round"/>
    <line x1="42" y1="46" x2="70" y2="46" stroke="#52525b" stroke-width="2" stroke-linecap="round"/>
    <line x1="42" y1="54" x2="62" y2="54" stroke="#52525b" stroke-width="2" stroke-linecap="round"/>
    <rect x="46" y="48" width="68" height="46" rx="8" fill="url(#illPayCardGrad)" stroke="#71717a" stroke-width="1.5"/>
    <rect x="46" y="58" width="68" height="8" fill="#18181b"/>
    <rect x="56" y="74" width="14" height="10" rx="2.5" fill="#fbbf24" opacity="0.9"/>
    <circle cx="98" cy="78" r="5" fill="#e4e4e7" opacity="0.6"/>
    <circle cx="36" cy="96" r="14" fill="url(#illCoinGrad)" stroke="#f59e0b" stroke-width="1.5"/>
    <text x="36" y="101" font-family="sans-serif" font-size="14" font-weight="bold" fill="#78350f" text-anchor="middle">$</text>
    <g>
      <path d="M116 26 L117.5 30.5 L122 32 L117.5 33.5 L116 38 L114.5 33.5 L110 32 L114.5 30.5 Z" fill="#e4e4e7"/>
      <path d="M22 46 L23 49 L26 50 L23 51 L22 54 L21 51 L18 50 L21 49 Z" fill="#a1a1aa"/>
      <path d="M102 104 L103 106 L105 107 L103 108 L102 110 L101 108 L99 107 L101 106 Z" fill="#71717a"/>
    </g>
  </svg>`,

  search: `<svg class="component-empty-state-svg" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="illSearchGlass" x1="30" y1="26" x2="86" y2="82" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="#71717a" stop-opacity="0.05"/>
      </linearGradient>
      <linearGradient id="illSearchRim" x1="28" y1="24" x2="88" y2="84" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#a1a1aa"/>
        <stop offset="50%" stop-color="#71717a"/>
        <stop offset="100%" stop-color="#3f3f46"/>
      </linearGradient>
      <linearGradient id="illSearchHandle" x1="76" y1="76" x2="114" y2="114" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#71717a"/>
        <stop offset="50%" stop-color="#52525b"/>
        <stop offset="100%" stop-color="#27272a"/>
      </linearGradient>
    </defs>
    <circle cx="58" cy="54" r="38" stroke="var(--border-color, #3f3f46)" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.4"/>
    <path d="M80 76 L110 106" stroke="url(#illSearchHandle)" stroke-width="12" stroke-linecap="round"/>
    <path d="M80 76 L110 106" stroke="#a1a1aa" stroke-width="4" stroke-linecap="round" opacity="0.4"/>
    <circle cx="110" cy="106" r="6" fill="#27272a"/>
    <circle cx="58" cy="54" r="30" fill="url(#illSearchGlass)" stroke="url(#illSearchRim)" stroke-width="6"/>
    <path d="M38 42 C44 34 54 30 66 32" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-opacity="0.5" fill="none"/>
    <circle cx="54" cy="50" r="3.5" fill="#e4e4e7"/>
    <circle cx="68" cy="60" r="2.5" fill="#a1a1aa"/>
    <circle cx="48" cy="62" r="2" fill="#71717a"/>
    <g>
      <path d="M106 28 L107.5 32.5 L112 34 L107.5 35.5 L106 40 L104.5 35.5 L100 34 L104.5 32.5 Z" fill="#e4e4e7"/>
      <path d="M22 66 L23 69 L26 70 L23 71 L22 74 L21 71 L18 70 L21 69 Z" fill="#a1a1aa"/>
      <path d="M84 18 L85 20 L87 21 L85 22 L84 24 L83 22 L81 21 L83 20 Z" fill="#71717a"/>
    </g>
  </svg>`,

  winners: `<svg class="component-empty-state-svg" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="illTrophyCup" x1="42" y1="28" x2="98" y2="88" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#71717a"/>
        <stop offset="50%" stop-color="#52525b"/>
        <stop offset="100%" stop-color="#27272a"/>
      </linearGradient>
      <linearGradient id="illTrophyGold" x1="56" y1="42" x2="84" y2="70" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#fde047"/>
        <stop offset="100%" stop-color="#d97706"/>
      </linearGradient>
      <linearGradient id="illTrophyBase" x1="46" y1="94" x2="94" y2="114" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#52525b"/>
        <stop offset="100%" stop-color="#18181b"/>
      </linearGradient>
    </defs>
    <path d="M42 42 C30 42 26 54 26 62 C26 72 36 76 46 76" stroke="#71717a" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M98 42 C110 42 114 54 114 62 C114 72 104 76 94 76" stroke="#71717a" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M40 32 L100 32 L94 72 C92 84 80 92 70 92 C60 92 48 84 46 72 Z" fill="url(#illTrophyCup)" stroke="#71717a" stroke-width="2"/>
    <path d="M70 50 L72.5 56.5 L79.5 57 L74.2 61.5 L76 68.5 L70 65 L64 68.5 L65.8 61.5 L60.5 57 L67.5 56.5 Z" fill="url(#illTrophyGold)"/>
    <rect x="66" y="92" width="8" height="12" fill="#52525b"/>
    <path d="M48 104 L92 104 L96 114 L44 114 Z" fill="url(#illTrophyBase)" stroke="#71717a" stroke-width="1.5"/>
    <line x1="54" y1="109" x2="86" y2="109" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/>
    <g>
      <path d="M116 24 L117.5 28.5 L122 30 L117.5 31.5 L116 36 L114.5 31.5 L110 30 L114.5 28.5 Z" fill="#e4e4e7"/>
      <path d="M24 34 L25 37 L28 38 L25 39 L24 42 L23 39 L20 38 L23 37 Z" fill="#fbbf24"/>
      <path d="M102 96 L103 98 L105 99 L103 100 L102 102 L101 100 L99 99 L101 98 Z" fill="#71717a"/>
    </g>
  </svg>`,
};

EMPTY_ILLUSTRATIONS.orders = EMPTY_ILLUSTRATIONS.payments;
EMPTY_ILLUSTRATIONS.payment = EMPTY_ILLUSTRATIONS.payments;
EMPTY_ILLUSTRATIONS.receipt = EMPTY_ILLUSTRATIONS.payments;
EMPTY_ILLUSTRATIONS.users = EMPTY_ILLUSTRATIONS.customers;
EMPTY_ILLUSTRATIONS.participants = EMPTY_ILLUSTRATIONS.customers;
EMPTY_ILLUSTRATIONS.trophy = EMPTY_ILLUSTRATIONS.winners;
EMPTY_ILLUSTRATIONS.giveaway = EMPTY_ILLUSTRATIONS.winners;
EMPTY_ILLUSTRATIONS.giveaways = EMPTY_ILLUSTRATIONS.winners;

export function getEmptyIllustration(key: string | EmptyIllustrationKey): string {
  const normalizedKey = (key || 'default').toLowerCase().trim();
  return EMPTY_ILLUSTRATIONS[normalizedKey] || EMPTY_ILLUSTRATIONS.default;
}
