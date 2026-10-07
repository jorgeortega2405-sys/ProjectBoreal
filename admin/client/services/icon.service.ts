const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

export function createIconSvg(name: string, extraClasses = ''): string {
  const classes = extraClasses ? `component-icon ${extraClasses}` : 'component-icon';
  return `<svg class="${classes}" aria-hidden="true"><use href="/icons.svg#${name}"></use></svg>`;
}

export function renderIcons(root: ParentNode = document): void {
  const targets = root.querySelectorAll<HTMLElement>('.component-icon, .material-symbols-rounded');

  targets.forEach((node) => {
    if (node.tagName.toLowerCase() === 'svg') return;

    const iconName = node.textContent?.trim();
    if (!iconName) return;

    const svg = document.createElementNS(SVG_NS, 'svg');
    const existingClasses = Array.from(node.classList)
      .map((cls) => (cls === 'material-symbols-rounded' ? 'component-icon' : cls));

    if (!existingClasses.includes('component-icon')) {
      existingClasses.unshift('component-icon');
    }

    svg.setAttribute('class', existingClasses.join(' '));
    svg.setAttribute('aria-hidden', 'true');

    const style = node.getAttribute('style');
    if (style) svg.setAttribute('style', style);

    const dataRef = node.getAttribute('data-ref');
    if (dataRef) svg.setAttribute('data-ref', dataRef);

    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `/icons.svg#${iconName}`);
    use.setAttributeNS(XLINK_NS, 'xlink:href', `/icons.svg#${iconName}`);
    svg.appendChild(use);

    node.replaceWith(svg);
  });
}
