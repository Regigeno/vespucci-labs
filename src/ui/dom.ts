type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  children: Child[] = [],
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function img(src: string, className?: string, alt = ""): HTMLImageElement {
  const image = el("img", className, [], { src, alt, draggable: "false" });
  return image;
}

export const asset = (name: string): string => `${import.meta.env.BASE_URL}assets/${name}`;

/** Resolves once every listed image has loaded (or failed), so scenes never pop in half-drawn. */
export function preload(names: string[]): Promise<void> {
  return Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve) => {
          const image = new Image();
          image.onload = () => resolve();
          image.onerror = () => resolve();
          image.src = asset(name);
        }),
    ),
  ).then(() => undefined);
}
