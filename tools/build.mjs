/** Inline sim.js + render.js into a single self-contained index.html. */
import { readFileSync, writeFileSync } from 'fs';
const strip = (f) => readFileSync(f, 'utf8')
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^export (function|const|let) /gm, '$1 ');
const html = readFileSync('tools/page.html', 'utf8')
  .replace('/*__SIM__*/', strip('sim.js'))
  .replace('/*__RENDER__*/', strip('render.js'));
writeFileSync('index.html', html);
console.log(`index.html  ${(html.length / 1024).toFixed(1)} KB`);
