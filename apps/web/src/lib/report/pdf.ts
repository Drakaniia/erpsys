import type {
  PdfMakeEngine,
  PdfMakeFontContainer,
} from "pdfmake/build/pdfmake";
import logoDataUri from "./assets/cot-sbo-logo.png?inline";
import { LOGO_KEY } from "./furniture";

/**
 * pdfmake's standard-font AFM data, split into its own lazily-fetched module
 * so it is only pulled in when a report is actually generated.
 *
 * Spec 5.7 wanted the standard PDF fonts with no `vfs_fonts` import. That
 * holds in spirit but not in the 0.3 API: the AFMs are no longer bundled into
 * `build/pdfmake`, so `Helvetica` must be registered explicitly or every
 * `createPdf` throws `Font 'Helvetica' ... is not defined`. This module is
 * ~300 kB raw against `vfs_fonts`' ~855 kB, so it preserves the spec's actual
 * intent -- Helvetica/WinAnsi, no embedded Roboto -- at a third of the weight.
 */
async function loadStandardFonts(): Promise<PdfMakeFontContainer> {
  const mod = await import("pdfmake/build/standard-fonts/Helvetica.js");
  return mod.default ?? mod;
}

/**
 * The data URI is a BUILD-TIME constant: Vite inlines the PNG at build time
 * (`?inline`), so there is no runtime fetch of `/images/...`, no canvas
 * conversion, and no async asset loading to fail (spec 5.8).
 */
const LOGO_DATA_URI: string = logoDataUri;

/**
 * pdfmake 0.3's `addVirtualFileSystem` base64-decodes whatever string it is
 * given, so a `data:image/png;base64,` URI stored under the key would be
 * decoded from the wrong offset and fail with `Unknown image format`. Strip
 * the prefix and hand over the raw base64 payload.
 */
function base64Payload(dataUri: string): string {
  const marker = "base64,";
  const at = dataUri.indexOf(marker);
  return at === -1 ? dataUri : dataUri.slice(at + marker.length);
}

/**
 * pdfmake's browser build is a UMD bundle, so under a bundler the module
 * namespace carries the instance on `.default`; a CJS-interop path can skip it.
 * Isolated here so the memoised loader body stays readable.
 */
async function loadEngine(): Promise<PdfMakeEngine> {
  const mod = await import("pdfmake/build/pdfmake");
  return mod.default ?? mod;
}

let pending: Promise<PdfMakeEngine> | null = null;

/**
 * Loads and memoises the pdfmake engine. The `import()` is inside the function
 * body on purpose: that is what makes Vite split the engine into its own chunk,
 * so the ~2.4 MB of pdfmake is fetched when a user first clicks Generate and
 * never otherwise (spec 5.2 / 5.11, gate in 7.3).
 *
 * The report-owned half of the virtual file system holds exactly one entry --
 * the logo under `LOGO_KEY`. The only other vfs content is pdfmake's own
 * standard-font AFM data, which is what makes `Helvetica` resolvable at all
 * in 0.3; no typeface is embedded, so the WinAnsi constraint of spec 5.7
 * still holds.
 */
export function loadPdfMake(): Promise<PdfMakeEngine> {
  pending ??= (async () => {
    const [engine, standardFonts] = await Promise.all([
      loadEngine(),
      loadStandardFonts(),
    ]);

    engine.addFontContainer(standardFonts);
    engine.addVirtualFileSystem({ [LOGO_KEY]: base64Payload(LOGO_DATA_URI) });

    return engine;
  })();

  return pending;
}
