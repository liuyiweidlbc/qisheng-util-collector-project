import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bodyPath = path.join(root, 'src/app-body.inc.js');
const headerPath = path.join(root, 'header.meta.js');
const earlyPath = path.join(root, 'early/document-start.js');

if (!fs.existsSync(bodyPath)) {
  throw new Error('Missing src/app-body.inc.js — restore from last good monolith extract');
}
if (!fs.existsSync(headerPath) || !fs.existsSync(earlyPath)) {
  throw new Error('Missing header.meta.js or early/document-start.js');
}

const configPath = path.join(root, 'src/config.js');
const configText = fs.readFileSync(configPath, 'utf8');
const verMatch = configText.match(/SCRIPT_VERSION\s*=\s*['"]([^'"]+)['"]/);
const scriptVersion = verMatch ? verMatch[1] : null;
if (!scriptVersion) {
  throw new Error('Cannot read SCRIPT_VERSION from src/config.js');
}
let header = fs.readFileSync(headerPath, 'utf8');
header = header.replace(/@version\s+[^\n]+/, '@version      ' + scriptVersion);
fs.writeFileSync(headerPath, header.endsWith('\n') ? header : header + '\n');

let rest = fs.readFileSync(bodyPath, 'utf8').replace(/\r\n/g, '\n');
if (rest.includes('function earlyWrongSportPath')) {
  throw new Error('app-body.inc.js must not contain earlyWrongSportPath');
}

const app =
  `import { SCRIPT_VERSION as MOD_SCRIPT_VERSION } from './config.js';\n` +
  `import * as KeepalivePhase from './keepalive.js';\n` +
  `import { createLoginNavGate } from './login-nav-gate.js';\n` +
  `import { createHeartbeatRunner } from './scheduler.js';\n` +
  `import { createNavPicker } from './nav-picker.js';\n` +
  `import { createNavPolicy, isForbiddenInplayListUrl as modIsForbiddenInplayListUrl } from './nav-policy.js';\n` +
  `import { KEYS } from './storage-keys.js';\n\n` +
  `export function bootApp() {\n` +
  `  'use strict';\n\n` +
  `  const getKeepalivePhase = KeepalivePhase.getKeepalivePhase;\n` +
  `  const setKeepalivePhaseEnter = KeepalivePhase.setKeepalivePhaseEnter;\n` +
  `  const clearKeepalivePhase = KeepalivePhase.clearKeepalivePhase;\n` +
  `  const isKeepaliveEnterMatchPhase = KeepalivePhase.isKeepaliveEnterMatchPhase;\n` +
  `  const KEEPALIVE_PHASE_ENTER = KeepalivePhase.KEEPALIVE_PHASE_ENTER;\n` +
  `  void KEYS;\n` +
  `  void MOD_SCRIPT_VERSION;\n\n` +
  rest.replace(/^/gm, '  ') +
  `}\n`;

fs.writeFileSync(path.join(root, 'src/app.js'), app);
console.log('Prepared src/app.js from app-body.inc.js, lines', app.split('\n').length);
