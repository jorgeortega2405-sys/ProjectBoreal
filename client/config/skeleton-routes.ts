import { DAILY_GIVEAWAY_SKELETON_TEMPLATE, DRAWING_SKELETON_TEMPLATE, GIVEAWAY_DETAIL_SKELETON_TEMPLATE, HOME_SKELETON_TEMPLATE, LEGAL_SKELETON_TEMPLATE, NOT_FOUND_SKELETON_TEMPLATE, SETTINGS_SKELETON_TEMPLATE, VALIDATE_PAYMENT_SKELETON_TEMPLATE, WINNERS_SKELETON_TEMPLATE } from './skeleton-templates.js';

export function getSkeletonTemplateForRouteId(routeId: string): string {
  switch (routeId) {
    case 'home':
      return HOME_SKELETON_TEMPLATE;
    case 'giveaway-detail':
      return GIVEAWAY_DETAIL_SKELETON_TEMPLATE;
    case 'daily-giveaway':
      return DAILY_GIVEAWAY_SKELETON_TEMPLATE;
    case 'winners':
      return WINNERS_SKELETON_TEMPLATE;
    case 'validate-payment':
      return VALIDATE_PAYMENT_SKELETON_TEMPLATE;
    case 'settings':
      return SETTINGS_SKELETON_TEMPLATE;
    case 'drawing':
      return DRAWING_SKELETON_TEMPLATE;
    case 'legal-terms':
    case 'legal-privacy':
    case 'legal-cookies':
    case 'legal-rules':
    case 'legal-prizes':
    case 'legal-responsible-gaming':
      return LEGAL_SKELETON_TEMPLATE;
    case 'not-found':
      return NOT_FOUND_SKELETON_TEMPLATE;
    default:
      return HOME_SKELETON_TEMPLATE;
  }
}

export function createSkeletonElement(routeId: string): HTMLElement {
  const templateHtml = getSkeletonTemplateForRouteId(routeId);
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = templateHtml.trim();
  return (tempDiv.firstElementChild as HTMLElement) || tempDiv;
}
