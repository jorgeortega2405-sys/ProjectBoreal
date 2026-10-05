export type EmptyIllustrationKey =
  | 'default'
  | 'drawing'
  | 'error'
  | 'gift'
  | 'giveaway'
  | 'lottery'
  | 'notifications'
  | 'payment'
  | 'receipt'
  | 'search'
  | 'tickets'
  | 'trophy'
  | 'users'
  | 'winners';

export const EMPTY_ILLUSTRATIONS: Record<string, string> = {
  giveaway: `<svg class="component-empty-state-svg" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="illGiftBoxGrad" x1="40" y1="50" x2="100" y2="110" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#52525b"/>
        <stop offset="50%" stop-color="#3f3f46"/>
        <stop offset="100%" stop-color="#27272a"/>
      </linearGradient>
      <linearGradient id="illGiftLidGrad" x1="36" y1="44" x2="104" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#71717a"/>
        <stop offset="50%" stop-color="#52525b"/>
        <stop offset="100%" stop-color="#3f3f46"/>
      </linearGradient>
      <linearGradient id="illMonoRibbon" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="50%" stop-color="#d4d4d8"/>
        <stop offset="100%" stop-color="#a1a1aa"/>
      </linearGradient>
    </defs>
    <rect x="42" y="58" width="56" height="52" rx="8" fill="url(#illGiftBoxGrad)" stroke="#71717a" stroke-width="2"/>
    <rect x="38" y="48" width="64" height="14" rx="4" fill="url(#illGiftLidGrad)" stroke="#a1a1aa" stroke-width="2"/>
    <rect x="65" y="48" width="10" height="62" fill="url(#illMonoRibbon)"/>
    <rect x="38" y="52" width="64" height="6" fill="url(#illMonoRibbon)" opacity="0.85"/>
    <path d="M70 48 C60 34 46 36 54 44 C62 52 70 48 70 48 Z" fill="url(#illMonoRibbon)"/>
    <path d="M70 48 C80 34 94 36 86 44 C78 52 70 48 70 48 Z" fill="url(#illMonoRibbon)"/>
    <circle cx="70" cy="48" r="4.5" fill="#f4f4f5"/>
    <g>
      <path d="M116 26 L117.5 30.5 L122 32 L117.5 33.5 L116 38 L114.5 33.5 L110 32 L114.5 30.5 Z" fill="#e4e4e7"/>
      <path d="M24 44 L25 47 L28 48 L25 49 L24 52 L23 49 L20 48 L23 47 Z" fill="#a1a1aa"/>
      <path d="M102 96 L103 98 L105 99 L103 100 L102 102 L101 100 L99 99 L101 98 Z" fill="#71717a"/>
    </g>
  </svg>`,

  trophy: `<svg class="component-empty-state-svg" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="illTrophyCupGrad" x1="44" y1="36" x2="96" y2="86" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#f4f4f5"/>
        <stop offset="40%" stop-color="#d4d4d8"/>
        <stop offset="100%" stop-color="#71717a"/>
      </linearGradient>
      <linearGradient id="illTrophyBaseGrad" x1="48" y1="94" x2="92" y2="114" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#52525b"/>
        <stop offset="50%" stop-color="#3f3f46"/>
        <stop offset="100%" stop-color="#27272a"/>
      </linearGradient>
    </defs>
    <path d="M46 44 C32 44 30 66 48 72" stroke="#71717a" stroke-width="4.5" stroke-linecap="round" fill="none"/>
    <path d="M94 44 C108 44 110 66 92 72" stroke="#71717a" stroke-width="4.5" stroke-linecap="round" fill="none"/>
    <rect x="50" y="102" width="40" height="12" rx="3" fill="url(#illTrophyBaseGrad)" stroke="#71717a" stroke-width="1.5"/>
    <rect x="66" y="86" width="8" height="18" rx="2" fill="#52525b"/>
    <path d="M56 86 C56 90 84 90 84 86 Z" fill="#3f3f46"/>
    <path d="M46 36 L94 36 C94 66 84 86 70 86 C56 86 46 66 46 36 Z" fill="url(#illTrophyCupGrad)" stroke="#52525b" stroke-width="2"/>
    <ellipse cx="70" cy="36" rx="24" ry="5.5" fill="#f4f4f5" stroke="#71717a" stroke-width="1.5"/>
    <polygon points="70,50 72.5,56 79,56 73.8,60 75.8,66 70,62 64.2,66 66.2,60 61,56 67.5,56" fill="#ffffff" opacity="0.95"/>
    <g>
      <path d="M116 24 L117.5 28.5 L122 30 L117.5 31.5 L116 36 L114.5 31.5 L110 30 L114.5 28.5 Z" fill="#e4e4e7"/>
      <path d="M22 46 L23 49 L26 50 L23 51 L22 54 L21 51 L18 50 L21 49 Z" fill="#a1a1aa"/>
      <path d="M98 104 L99 106 L101 107 L99 108 L98 110 L97 108 L95 107 L97 106 Z" fill="#71717a"/>
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

  payment: `<svg class="component-empty-state-svg" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="illCardGradSub" x1="25" y1="35" x2="115" y2="95" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#71717a"/>
        <stop offset="50%" stop-color="#52525b"/>
        <stop offset="100%" stop-color="#27272a"/>
      </linearGradient>
    </defs>
    <rect x="30" y="42" width="80" height="54" rx="10" fill="url(#illCardGradSub)" stroke="#71717a" stroke-width="2"/>
    <rect x="30" y="54" width="80" height="10" fill="#18181b"/>
    <rect x="42" y="74" width="16" height="12" rx="3" fill="#e4e4e7" opacity="0.7"/>
    <g transform="translate(86, 78)">
      <path d="M0 -8 L2.4 -2.5 L8.5 -2.5 L3.6 1.2 L5.5 7 L0 3.5 L-5.5 7 L-3.6 1.2 L-8.5 -2.5 L-2.4 -2.5 Z" fill="#e4e4e7"/>
    </g>
    <g>
      <path d="M116 24 L117.5 28.5 L122 30 L117.5 31.5 L116 36 L114.5 31.5 L110 30 L114.5 28.5 Z" fill="#e4e4e7"/>
      <path d="M22 46 L23 49 L26 50 L23 51 L22 54 L21 51 L18 50 L21 49 Z" fill="#a1a1aa"/>
      <path d="M98 104 L99 106 L101 107 L99 108 L98 110 L97 108 L95 107 L97 106 Z" fill="#71717a"/>
    </g>
  </svg>`,

  error: `<svg class="component-empty-state-svg" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="illErrorDoc" x1="30" y1="26" x2="105" y2="105" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#71717a"/>
        <stop offset="50%" stop-color="#52525b"/>
        <stop offset="100%" stop-color="#27272a"/>
      </linearGradient>
    </defs>
    <rect x="36" y="28" width="68" height="84" rx="10" fill="url(#illErrorDoc)" stroke="#71717a" stroke-width="2"/>
    <circle cx="70" cy="62" r="14" fill="#a1a1aa" opacity="0.2"/>
    <circle cx="70" cy="62" r="12" stroke="#a1a1aa" stroke-width="2"/>
    <path d="M70 54 L70 64" stroke="#e4e4e7" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="70" cy="70" r="1.5" fill="#e4e4e7"/>
    <line x1="48" y1="88" x2="92" y2="88" stroke="#71717a" stroke-width="2" stroke-linecap="round"/>
    <line x1="48" y1="96" x2="76" y2="96" stroke="#52525b" stroke-width="2" stroke-linecap="round"/>
    <g>
      <path d="M116 24 L117.5 28.5 L122 30 L117.5 31.5 L116 36 L114.5 31.5 L110 30 L114.5 28.5 Z" fill="#e4e4e7"/>
    </g>
  </svg>`,

  users: `<svg class="component-empty-state-svg" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="illUserGradMain" x1="35" y1="35" x2="105" y2="105" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#52525b"/>
        <stop offset="50%" stop-color="#3f3f46"/>
        <stop offset="100%" stop-color="#27272a"/>
      </linearGradient>
      <linearGradient id="illUserGradBack" x1="30" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#3f3f46"/>
        <stop offset="100%" stop-color="#18181b"/>
      </linearGradient>
    </defs>
    <g opacity="0.6">
      <circle cx="48" cy="46" r="14" fill="url(#illUserGradBack)" stroke="#52525b" stroke-width="1.5"/>
      <path d="M28 84 C28 70 38 68 48 68 C58 68 68 70 68 84 Z" fill="url(#illUserGradBack)" stroke="#52525b" stroke-width="1.5"/>
    </g>
    <g opacity="0.6">
      <circle cx="92" cy="46" r="14" fill="url(#illUserGradBack)" stroke="#52525b" stroke-width="1.5"/>
      <path d="M72 84 C72 70 82 68 92 68 C102 68 112 70 112 84 Z" fill="url(#illUserGradBack)" stroke="#52525b" stroke-width="1.5"/>
    </g>
    <circle cx="70" cy="50" r="18" fill="url(#illUserGradMain)" stroke="#71717a" stroke-width="2"/>
    <circle cx="70" cy="46" r="6" fill="#e4e4e7" opacity="0.8"/>
    <path d="M44 98 C44 80 56 76 70 76 C84 76 96 80 96 98 Z" fill="url(#illUserGradMain)" stroke="#71717a" stroke-width="2"/>
    <rect x="62" y="82" width="16" height="4" rx="2" fill="#e4e4e7" opacity="0.5"/>
    <g>
      <path d="M116 28 L117.5 32.5 L122 34 L117.5 35.5 L116 40 L114.5 35.5 L110 34 L114.5 32.5 Z" fill="#e4e4e7"/>
      <path d="M22 46 L23 49 L26 50 L23 51 L22 54 L21 51 L18 50 L21 49 Z" fill="#a1a1aa"/>
      <path d="M102 96 L103 98 L105 99 L103 100 L102 102 L101 100 L99 99 L101 98 Z" fill="#71717a"/>
    </g>
  </svg>`,

  notifications: `<svg class="component-empty-state-svg" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="illBellGrad" x1="35" y1="30" x2="105" y2="100" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#71717a"/>
        <stop offset="50%" stop-color="#52525b"/>
        <stop offset="100%" stop-color="#27272a"/>
      </linearGradient>
    </defs>
    <path d="M70 28 C64 28 60 32 60 37 L60 40 C48 44 42 54 42 70 L36 84 L104 84 L98 70 C98 54 92 44 80 40 L80 37 C80 32 76 28 70 28 Z" fill="url(#illBellGrad)" stroke="#71717a" stroke-width="2"/>
    <path d="M60 92 C60 98 64 102 70 102 C76 102 80 98 80 92 Z" fill="#a1a1aa"/>
    <circle cx="94" cy="40" r="6" fill="#e4e4e7"/>
    <g>
      <path d="M118 24 L119.5 28.5 L124 30 L119.5 31.5 L118 36 L116.5 31.5 L112 30 L116.5 28.5 Z" fill="#e4e4e7"/>
      <path d="M22 46 L23 49 L26 50 L23 51 L22 54 L21 51 L18 50 L21 49 Z" fill="#a1a1aa"/>
    </g>
  </svg>`
};

EMPTY_ILLUSTRATIONS.lottery = EMPTY_ILLUSTRATIONS.giveaway;
EMPTY_ILLUSTRATIONS.gift = EMPTY_ILLUSTRATIONS.giveaway;
EMPTY_ILLUSTRATIONS.tickets = EMPTY_ILLUSTRATIONS.giveaway;
EMPTY_ILLUSTRATIONS.winners = EMPTY_ILLUSTRATIONS.trophy;
EMPTY_ILLUSTRATIONS.drawing = EMPTY_ILLUSTRATIONS.trophy;
EMPTY_ILLUSTRATIONS.receipt = EMPTY_ILLUSTRATIONS.payment;
EMPTY_ILLUSTRATIONS.default = EMPTY_ILLUSTRATIONS.giveaway;

export function getEmptyIllustration(key: string | EmptyIllustrationKey): string {
  const normalizedKey = (key || 'default').toLowerCase().trim();
  return EMPTY_ILLUSTRATIONS[normalizedKey] || EMPTY_ILLUSTRATIONS.default;
}
