/**
 * One-shot splitter: user.js → header / early / app body for esbuild project.
 * Run from repo root: node tamper_monkey/hty-inplay-quant-bet/scripts/split-from-monolith.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const monoPath = path.resolve(root, '../hty-inplay-quant-bet.user.js');
const src = fs.readFileSync(monoPath, 'utf8');

const headerEnd = src.indexOf('// ==/UserScript==');
if (headerEnd < 0) throw new Error('no userscript header end');
const header = src.slice(0, headerEnd + '// ==/UserScript=='.length).trim() + '\n';

const iifeStart = src.indexOf("(function () {\n    'use strict';");
if (iifeStart < 0) throw new Error('no IIFE start');
let body = src.slice(iifeStart + "(function () {\n    'use strict';".length);

// Strip trailing })();
body = body.replace(/\n\}\)\(\);\s*$/, '\n');

// Split early block: from first earlyWrongSport through earlyBounce call
const earlyMarker = '    /** document-start：';
const earlyAlt = '    function earlyWrongSportPath';
const earlyIdx = body.indexOf(earlyMarker) >= 0 ? body.indexOf(earlyMarker) : body.indexOf(earlyAlt);
const afterEarly = body.indexOf("    if (earlyBounceToFootballInplay('document-start'))");
if (earlyIdx < 0 || afterEarly < 0) throw new Error('early block not found');
const earlyEnd = body.indexOf('\n', body.indexOf('}', afterEarly)) + 1;
// find end of if block
let brace = afterEarly;
const ifLine = body.indexOf('{', afterEarly);
let depth = 0;
let i = ifLine;
for (; i < body.length; i++) {
  if (body[i] === '{') depth++;
  else if (body[i] === '}') {
    depth--;
    if (depth === 0) {
      i++;
      break;
    }
  }
}
const earlyBlock = body.slice(earlyIdx, i).trim() + '\n';
const rest = body.slice(0, earlyIdx) + body.slice(i);

fs.writeFileSync(path.join(root, 'header.meta.js'), header);
fs.writeFileSync(
  path.join(root, 'early/document-start.js'),
  '/* document-start guard — prepended before bundle */\n(function () {\n' +
    earlyBlock.replace(/^    /gm, '  ') +
    '})();\n'
);

const appJs =
  `/** Auto-generated app body from monolith; boot via main.js */\n` +
  `import * as KeepalivePhase from './keepalive.js';\n` +
  `import * as LoginNavGate from './login-nav-gate.js';\n` +
  `import { createHeartbeatRunner } from './scheduler.js';\n` +
  `import * as NavPicker from './nav-picker.js';\n` +
  `import * as NavPolicy from './nav-policy.js';\n` +
  `import { KEYS } from './storage-keys.js';\n` +
  `import * as Config from './config.js';\n\n` +
  `export function bootApp() {\n` +
  `  'use strict';\n` +
  `  // --- module aliases (Phase 3 wiring) ---\n` +
  `  const getKeepalivePhase = KeepalivePhase.getKeepalivePhase;\n` +
  `  const setKeepalivePhaseEnter = KeepalivePhase.setKeepalivePhaseEnter;\n` +
  `  const clearKeepalivePhase = KeepalivePhase.clearKeepalivePhase;\n` +
  `  const isKeepaliveEnterMatchPhase = KeepalivePhase.isKeepaliveEnterMatchPhase;\n` +
  `  const KEEPALIVE_PHASE_ENTER = KeepalivePhase.KEEPALIVE_PHASE_ENTER;\n` +
  `  const KEEPALIVE_PHASE_KEY = KEYS.KEEPALIVE_PHASE;\n` +
  `  void Config; void NavPolicy; void LoginNavGate; void NavPicker; void createHeartbeatRunner;\n\n` +
  rest.replace(/^/gm, '  ') +
  `\n}\n`;

fs.writeFileSync(path.join(root, 'src/app.js'), appJs);
console.log('Wrote header, early, src/app.js', {
  header: header.length,
  early: earlyBlock.length,
  rest: rest.length,
});
