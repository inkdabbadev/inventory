import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import QRCode from 'qrcode';

export type LabelFormat = 'standard' | 'cable';

export interface Label {
  code: string; // CBL-HDM-0007 (not printed; carried inside the QR)
  title: string; // HDMI cable · 10 m
  subtitle?: string | null; // Cables › HDMI
  /** @deprecated kept for older callers; the QR content is now built by qrText() */
  qrValue?: string;
  /** auto: cables get the wrap-around flag, everything else the square label */
  format?: LabelFormat;
}

/**
 * What the QR contains. A normal phone camera shows the name and category;
 * the item code on the last line is what the app uses to find the record.
 *
 *   HDMI cable · 10 m
 *   Cables › HDMI
 *   CBL-HDM-0007
 */
export function qrText(title: string, subtitle: string | null | undefined, code: string) {
  return [title, subtitle, code].filter(Boolean).join('\n');
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const formatOf = (l: Label): LabelFormat => l.format ?? (/^cables\b/i.test(l.subtitle ?? '') ? 'cable' : 'standard');

const svgFor = (l: Label) => QRCode.toString(qrText(l.title, l.subtitle, l.code), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });

/** Square label for devices, tools, boxes, shelves: QR + name + category. */
async function standardHtml(l: Label) {
  return `<div class="std">
    <div class="std-qr">${await svgFor(l)}</div>
    <div class="std-name">${escape(l.title)}</div>
    ${l.subtitle ? `<div class="std-cat">${escape(l.subtitle)}</div>` : ''}
  </div>`;
}

/**
 * Cable flag: printed part (QR + text) and a blank tail. Wrap the tail around the cable
 * and stick it back onto itself, like the factory label on a power cord.
 */
async function cableHtml(l: Label) {
  return `<div class="flag">
    <div class="flag-print">
      <div class="flag-qr">${await svgFor(l)}</div>
      <div class="flag-text">
        <div class="flag-name">${escape(l.title)}</div>
        ${l.subtitle ? `<div class="flag-cat">${escape(l.subtitle)}</div>` : ''}
      </div>
    </div>
    <div class="flag-tail"><span>wrap around cable</span></div>
  </div>`;
}

async function labelsHtml(labels: Label[]) {
  const cables = labels.filter((l) => formatOf(l) === 'cable');
  const others = labels.filter((l) => formatOf(l) === 'standard');
  const cableCells = await Promise.all(cables.map(cableHtml));
  const stdCells = await Promise.all(others.map(standardHtml));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; margin: 0; color: #111; }
    .sheet { display: flex; flex-wrap: wrap; gap: 3mm; margin-bottom: 5mm; }

    /* square label ~40 x 48 mm */
    .std { width: 40mm; border: 0.25mm dashed #aaa; border-radius: 2mm; padding: 2.5mm; text-align: center; break-inside: avoid; }
    .std-qr svg { width: 28mm; height: 28mm; display: block; margin: 0 auto; }
    .std-name { font-size: 9pt; font-weight: 700; line-height: 1.15; margin-top: 1.5mm; word-break: break-word; }
    .std-cat { font-size: 7pt; color: #555; margin-top: 0.5mm; }

    /* cable flag ~70 x 14 mm: 34 mm printed + 36 mm wrap tail */
    .cables { display: flex; flex-direction: column; gap: 3mm; margin-bottom: 5mm; }
    .flag { display: flex; width: 70mm; height: 14mm; border: 0.25mm dashed #aaa; border-radius: 1.5mm; break-inside: avoid; overflow: hidden; }
    .flag-print { display: flex; align-items: center; gap: 1.5mm; width: 34mm; padding: 1mm 1.5mm; }
    .flag-qr svg { width: 11.5mm; height: 11.5mm; display: block; }
    .flag-text { min-width: 0; }
    .flag-name { font-size: 6.5pt; font-weight: 700; line-height: 1.1; max-height: 7.2mm; overflow: hidden; }
    .flag-cat { font-size: 5.5pt; color: #555; margin-top: 0.5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .flag-tail { flex: 1; border-left: 0.25mm dotted #bbb; display: flex; align-items: center; justify-content: center; }
    .flag-tail span { font-size: 5pt; color: #ccc; letter-spacing: 0.3pt; }
  </style></head><body>
    ${cableCells.length ? `<div class="cables">${cableCells.join('')}</div>` : ''}
    ${stdCells.length ? `<div class="sheet">${stdCells.join('')}</div>` : ''}
  </body></html>`;
}

export async function printLabels(labels: Label[]) {
  if (labels.length === 0) return;
  await Print.printAsync({ html: await labelsHtml(labels) });
}

/** Exports the labels as a PDF and opens the share sheet (send to a label printer app, email, etc.). */
export async function shareLabelsPdf(labels: Label[]) {
  const { uri } = await Print.printToFileAsync({ html: await labelsHtml(labels) });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'QR labels' });
  }
}
