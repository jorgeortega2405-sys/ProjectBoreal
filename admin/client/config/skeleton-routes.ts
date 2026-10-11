import { ADMIN_BACKUPS_SKELETON_TEMPLATE, ADMIN_BANK_ACCOUNTS_SKELETON_TEMPLATE, ADMIN_CUSTOMERS_SKELETON_TEMPLATE, ADMIN_DASHBOARD_SKELETON_TEMPLATE, ADMIN_GIVEAWAY_FORM_SKELETON_TEMPLATE, ADMIN_GIVEAWAYS_SKELETON_TEMPLATE, ADMIN_HR_SKELETON_TEMPLATE, ADMIN_LOGIN_SKELETON_TEMPLATE, ADMIN_NOT_FOUND_SKELETON_TEMPLATE, ADMIN_PAYMENTS_SKELETON_TEMPLATE, ADMIN_WINNERS_SKELETON_TEMPLATE } from './skeleton-templates.js';

export function getAdminSkeletonTemplateForRouteId(routeId: string): string {
  switch (routeId) {
    case 'login':
      return ADMIN_LOGIN_SKELETON_TEMPLATE;
    case 'dashboard':
      return ADMIN_DASHBOARD_SKELETON_TEMPLATE;
    case 'giveaway-create':
    case 'giveaway-edit':
    case 'hr-create':
    case 'hr-edit':
      return ADMIN_GIVEAWAY_FORM_SKELETON_TEMPLATE;
    case 'giveaways':
      return ADMIN_GIVEAWAYS_SKELETON_TEMPLATE;
    case 'payments':
      return ADMIN_PAYMENTS_SKELETON_TEMPLATE;
    case 'bank-accounts':
      return ADMIN_BANK_ACCOUNTS_SKELETON_TEMPLATE;
    case 'customers':
      return ADMIN_CUSTOMERS_SKELETON_TEMPLATE;
    case 'winners':
      return ADMIN_WINNERS_SKELETON_TEMPLATE;
    case 'hr':
      return ADMIN_HR_SKELETON_TEMPLATE;
    case 'backups':
      return ADMIN_BACKUPS_SKELETON_TEMPLATE;
    case 'not-found':
      return ADMIN_NOT_FOUND_SKELETON_TEMPLATE;
    default:
      return ADMIN_DASHBOARD_SKELETON_TEMPLATE;
  }
}

export function createAdminSkeletonElement(routeId: string): HTMLElement {
  const templateHtml = getAdminSkeletonTemplateForRouteId(routeId);
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = templateHtml.trim();
  return (tempDiv.firstElementChild as HTMLElement) || tempDiv;
}
