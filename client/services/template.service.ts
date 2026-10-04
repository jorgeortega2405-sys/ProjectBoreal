import { translateElement } from './i18n.service.js';
import { renderIcons } from './icon.service.js';

const templateCache = new Map<string, string>();

export async function loadTemplate(url: string): Promise<HTMLElement> {
  let html = templateCache.get(url);
  if (!html) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error al cargar la plantilla: ${url} (${res.status})`);
    }
    html = await res.text();
    templateCache.set(url, html);
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
