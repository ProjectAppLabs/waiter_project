'use strict';

// El lanzador del fleet arranca cada app con `node node_modules/.bin/next start` desde la carpeta de la app y exige
// ese archivo. Con los workspaces, npm eleva next a frontend/node_modules y no deja .bin/next dentro de cada app:
// este postinstall lo enlaza al next que resuelve cada app. Falla fuerte (exit 1) si una app no encuentra next,
// para que el alta no siga con un lanzador roto.
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const { workspaces } = require(path.join(raiz, 'package.json'));
let fallos = 0;

for (const app of workspaces) {
  const carpeta = path.join(raiz, app);
  let destino;
  try {
    const manifiesto = require.resolve('next/package.json', { paths: [carpeta] });
    const { bin } = require(manifiesto);
    destino = path.resolve(path.dirname(manifiesto), typeof bin === 'string' ? bin : bin.next);
  } catch (error) {
    console.error(`enlazar-next: ${app} no resuelve next (${error.message}); corré npm ci en frontend/.`);
    fallos += 1;
    continue;
  }
  if (!fs.existsSync(destino)) {
    console.error(`enlazar-next: ${app} resuelve next pero falta su binario ${destino}.`);
    fallos += 1;
    continue;
  }
  const carpetaBin = path.join(carpeta, 'node_modules', '.bin');
  const enlace = path.join(carpetaBin, 'next');
  const relativo = path.relative(carpetaBin, destino);
  fs.mkdirSync(carpetaBin, { recursive: true });
  let actual = null;
  try {
    actual = fs.readlinkSync(enlace);
  } catch {
    // No existe o es un archivo común.
  }
  if (actual === null && fs.existsSync(enlace)) {
    console.log(`enlazar-next: ${app} ya trae su propio node_modules/.bin/next`);
    continue;
  }
  if (actual !== relativo) {
    fs.rmSync(enlace, { force: true });
    fs.symlinkSync(relativo, enlace);
  }
  console.log(`enlazar-next: ${app}/node_modules/.bin/next → ${relativo}`);
}

process.exitCode = fallos ? 1 : 0;
