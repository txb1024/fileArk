/// <reference types="vite/client" />

// pdfjs-dist worker URL 通过 ?url 后缀引入
declare module "*.mjs?url" {
  const src: string;
  export default src;
}

// opentype.js 没有官方类型
declare module "opentype.js" {
  interface FontName {
    [lang: string]: string;
  }
  interface OpenTypeFont {
    names?: Record<string, FontName>;
    glyphs?: { length: number };
    unitsPerEm?: number;
  }
  interface OpenType {
    parse(buffer: ArrayBuffer): OpenTypeFont;
  }
  const opentype: OpenType;
  export default opentype;
}
