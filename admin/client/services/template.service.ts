import { translateElement } from './i18n.service.js';
import { renderIcons } from './icon.service.js';

const templateCache = new Map<string, string>();

export async function loadTemplate(url: string): Promise<HTMLElement> {
  const isDev = Boolean((import.meta as any).env?.DEV);
  let html = isDev ? undefined : templateCache.get(url);
  if (!html) {
    const fetchUrl = isDev ? `${url}?_t=${Date.now()}` : url;
    const res = await fetch(fetchUrl, { cache: isDev ? 'no-cache' : 'default' });
    if (!res.ok) {
      throw new Error(`Error al cargar la plantilla: ${url} (${res.status})`);
    }
    html = await res.text();
    if (!isDev) {
      templateCache.set(url, html);
    }
  }

  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const element = template.content.firstElementChild as HTMLElement | null;
  if (!element) {
    throw new Error(`Plantilla vacía o inválida: ${url}`);
  }

  const clone = element.cloneNode(true) as HTMLElement;
  renderIcons(clone);
  return translateElement(clone);
}
