export type EmptyIllustrationKey = 'default' | 'search' | 'dashboard';

export const EMPTY_ILLUSTRATIONS: Record<string, string> = {
  dashboard: `<svg class="component-empty-state-svg" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="25" y="25" width="40" height="40" rx="8" fill="var(--color-orange-500, #ea580c)" fill-opacity="0.15" stroke="var(--color-orange-600, #c2410c)" stroke-width="2"/>
    <rect x="75" y="25" width="40" height="25" rx="8" fill="var(--color-orange-500, #ea580c)" fill-opacity="0.15" stroke="var(--color-orange-600, #c2410c)" stroke-width="2"/>
    <rect x="75" y="60" width="40" height="55" rx="8" fill="var(--color-orange-500, #ea580c)" fill-opacity="0.15" stroke="var(--color-orange-600, #c2410c)" stroke-width="2"/>
    <rect x="25" y="75" width="40" height="40" rx="8" fill="var(--color-orange-500, #ea580c)" fill-opacity="0.15" stroke="var(--color-orange-600, #c2410c)" stroke-width="2"/>
  </svg>`,
  default: `<svg class="component-empty-state-svg" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="70" cy="70" r="45" fill="var(--color-orange-500, #ea580c)" fill-opacity="0.12" stroke="var(--color-orange-600, #c2410c)" stroke-width="2"/>
    <path d="M50 70h40M70 50v40" stroke="var(--color-orange-600, #c2410c)" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  search: `<svg class="component-empty-state-svg" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="62" cy="62" r="30" stroke="var(--color-orange-600, #c2410c)" stroke-width="2" fill="var(--color-orange-500, #ea580c)" fill-opacity="0.12"/>
    <path d="M84 84l26 26" stroke="var(--color-orange-600, #c2410c)" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
};

export function getEmptyIllustration(key: string): string {
  return EMPTY_ILLUSTRATIONS[key] || EMPTY_ILLUSTRATIONS.default;
}
