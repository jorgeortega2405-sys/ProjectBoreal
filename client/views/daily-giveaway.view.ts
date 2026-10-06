import { fetchDailyGiveaway } from '../services/giveaways.service.js';
import { createGiveawayDetailView } from './giveaway-detail.view.js';
import { createNotFoundView } from './not-found.view.js';

export async function createDailyGiveawayView(): Promise<HTMLElement> {
  const payload = await fetchDailyGiveaway();
  if (payload?.giveaway?.uuid) {
    return await createGiveawayDetailView(payload.giveaway.uuid);
  }
  return await createNotFoundView();
}
