/**
 * Polices LibreOffice / ChromeOS et leurs équivalents Windows
 * (mêmes dimensions de caractères).
 */
const FONT_ALIASES: Record<string, string> = {
  'liberation sans': 'Arial',
  'liberation sans narrow': 'Arial',
  arimo: 'Arial',
  'liberation serif': 'Times New Roman',
  tinos: 'Times New Roman',
  'liberation mono': 'Courier New',
  cousine: 'Courier New'
};

/** Renvoie l'équivalent Windows d'une police LibreOffice, ou null. */
export function getFontAlias(name: string): string | null {
  const key = name.replace(/["']/g, '').trim().toLowerCase();
  return FONT_ALIASES[key] ?? null;
}

/** Remplace les polices Liberation dans du HTML collé. */
export function replaceLibreOfficeFontsInHtml(html: string): string {
  if (!html) {
    return html;
  }

  return html.replace(
    /Liberation (Sans Narrow|Sans|Serif|Mono)/gi,
    (_match: string, kind: string): string => {
      const lower = kind.toLowerCase();

      if (lower === 'serif') {
        return 'Times New Roman';
      }

      if (lower === 'mono') {
        return 'Courier New';
      }

      return 'Arial';
    }
  );
}