const CODE128B_CODES: number[] = [212222,222122,222221,121223,121322,131222,122213,122312,132212,221213,221312,231212,112232,122132,122231,113222,123122,123221,224211,221122,223211,221132,221231,213212,223112,312131,311222,321122,321221,312212,322112,322211,212123,212321,232121,111323,131123,131321,113121,313121,211312,231112,221311,231211,213112,213211,213121,231122,213221,221312,221321,231121,122312,132112,132211,122321,132121,312311,321112,321211,312112,322112,322211,212123,212321,232121,111323,131123,131321,113121,313121,211312,231112,221311,231211,213112,213211,213121,231122,213221,221312,221321,231121,122312,132112,132211,122321,132121,312311,321112,321211,312112,322112,322211,212123,212321,232121,111323,131123,131321,113121,313121,211312,231112,221311,231211,213112,213211,213121,231122,213221,221312,221321,231121,122312,132112,132211,122321,132121,312311,321112,321211,312112,322112,322211,212123,212321,232121,111323,131123,131321,113121,313121,211312,231112,221311,231211,213112,213211,213121,231122,213221,221312,221321,231121];

export function generateCode128SVG(data: string, height = 50): string {
  const START_B = 104;
  let values: number[] = [START_B];
  let checksum = START_B;
  for (let i = 0; i < data.length; i++) {
    const code = data.charCodeAt(i) - 32;
    values.push(code);
    checksum += code * (i + 1);
  }
  values.push(checksum % 103);
  values.push(2331112); // stop

  let x = 0;
  const bars: string[] = [];
  for (const value of values) {
    const pattern = value < CODE128B_CODES.length ? CODE128B_CODES[value] : 0;
    const patternStr = pattern.toString().padStart(6, '0');
    for (let j = 0; j < patternStr.length; j++) {
      const w = parseInt(patternStr[j]);
      if (j % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w}" height="${height}" fill="black"/>`);
      x += w;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${height}" viewBox="0 0 ${x} ${height}" shape-rendering="crispEdges">${bars.join('')}</svg>`;
}

export function Code128Barcode({ data, height = 50, className }: { data: string; height?: number; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: generateCode128SVG(data, height) }} />;
}
