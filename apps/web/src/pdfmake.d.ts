/**
 * pdfmake 0.3 ships no TypeScript declarations for its browser builds, so this
 * declares the two lazily-imported bundles with only the members the report
 * layer calls. It is deliberately NARROW -- pdfmake's own types (if they ever
 * land) can never leak into the docDefinition builders, which stay pure JSON
 * (spec 7.6).
 *
 * Each module is declared twice over: as a namespace of named exports (what a
 * CJS interop path hands back) and as a `default` (what the UMD bundler path
 * hands back), so `mod.default ?? mod` type-checks against both without a cast.
 */
declare module "pdfmake/build/pdfmake" {
  export interface PdfMakeFontContainer {
    vfs: Record<string, { data: string; encoding?: string } | string>;
    fonts: Record<string, unknown>;
  }

  /**
   * 0.3's `download` is ASYNC and renders the document to a buffer before it
   * hands the blob to file-saver. Its promise therefore carries the failure of
   * the whole render -- a missing font, an unresolvable image -- and a caller
   * that does not await it reports a success that never happened.
   */
  export interface PdfMakeDocument {
    download: (filename?: string) => Promise<void>;
    /** The rendered document, for the review modal's preview. */
    getBlob: () => Promise<Blob>;
  }

  export interface PdfMakeEngine {
    /**
     * Registers font/vfs data. In 0.3 this is the replacement for the 0.2
     * `pdfMake.vfs = { ... }` assignment.
     */
    addFontContainer: (fontContainer: PdfMakeFontContainer) => void;
    addVirtualFileSystem: (vfs: Record<string, string>) => void;
    createPdf: (docDefinition: unknown) => PdfMakeDocument;
  }

  const pdfMake: PdfMakeEngine;
  export default pdfMake;
  export const addFontContainer: PdfMakeEngine["addFontContainer"];
  export const addVirtualFileSystem: PdfMakeEngine["addVirtualFileSystem"];
  export const createPdf: PdfMakeEngine["createPdf"];
}

/**
 * pdfmake's standard-font AFM data. 0.3 no longer bundles the AFMs into
 * `build/pdfmake`, so `Helvetica` must be registered explicitly or every
 * `createPdf` throws `Font 'Helvetica' ... is not defined`.
 */
declare module "pdfmake/build/standard-fonts/Helvetica.js" {
  type FontContainer = import("pdfmake/build/pdfmake").PdfMakeFontContainer;

  const container: FontContainer;
  export default container;
  export const vfs: FontContainer["vfs"];
  export const fonts: FontContainer["fonts"];
}
