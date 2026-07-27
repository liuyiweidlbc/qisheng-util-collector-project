import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outUserJs = path.resolve(__dirname, '../hty-inplay-quant-bet.user.js');
const header = fs.readFileSync(path.join(__dirname, 'header.meta.js'), 'utf8');
const early = fs.readFileSync(path.join(__dirname, 'early/document-start.js'), 'utf8');

const result = await esbuild.build({
  entryPoints: [path.join(__dirname, 'src/main.js')],
  bundle: true,
  format: 'iife',
  write: false,
  target: ['es2018'],
  legalComments: 'none',
});

const bundle = result.outputFiles[0].text;
const banner =
  header.trim() +
  '\n\n' +
  '/* === early document-start guard === */\n' +
  early.trim() +
  '\n\n' +
  '/* === bundled app (esbuild) === */\n';

fs.writeFileSync(outUserJs, banner + bundle + '\n');
console.log('Built', outUserJs, 'bytes', banner.length + bundle.length);
