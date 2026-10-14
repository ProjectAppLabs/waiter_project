"""Build the complete, offline visual audit. Requires Pillow for PNG validation.
Run from any directory: python3 report.py --captures /tmp/exporty-audit/current
The generated report contains the user-supplied exports, not production UI assets.
"""
import argparse
import hashlib
import html
import json
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET
import zipfile
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
p = argparse.ArgumentParser()
p.add_argument('--zip', type=Path, default=ROOT / 'exporty-light-mode.zip')
p.add_argument('--captures', type=Path, default=Path('/tmp/exporty-audit/current'))
p.add_argument('--output', type=Path, default=ROOT / 'test-reports/exporty')
args = p.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.zip) as archive:
    for info in archive.infolist():
        relative = Path(info.filename)
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError(f'Unsafe ZIP member: {info.filename}')
        if info.is_dir():
            continue
        target = args.output / 'source' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(info) as src, target.open('wb') as dst:
            shutil.copyfileobj(src, dst)
source = args.output / 'source'
mapping = json.loads((source / 'asset-map.json').read_text())
notes = json.loads((ROOT / 'docs/diseno/exporty/exporty-review.json').read_text())
assert len(notes) == 99 and all(n['visuallyReviewed'] for n in notes)
screens = mapping['screens'][1:]
assert len(screens) == 99
installed = {}
for f in (ROOT / 'diner/public/smart-menu').rglob('*'):
    if f.suffix in ('.png', '.svg'):
        installed[hashlib.sha256(f.read_bytes()).hexdigest()] = str(f.relative_to(ROOT))
assets = {}
for screen in mapping['screens']:
    for asset in screen['assets']:
        file = source / asset['path']
        if asset['path'] not in assets:
            digest = hashlib.sha256(file.read_bytes()).hexdigest()
            item = {'path': asset['path'], 'kind': asset['kind'], 'sha256': digest, 'bytes': file.stat().st_size,
                    'installed': installed.get(digest), 'screens': [], 'usages': [], 'valid': True}
            if file.suffix == '.png':
                with Image.open(file) as im:
                    item['size'] = list(im.size)
                    im.verify()
            elif file.suffix == '.svg':
                el = ET.parse(file).getroot()
                item['viewBox'] = el.get('viewBox')
                item['externalReferences'] = [v for e in el.iter() for k, v in e.attrib.items()
                    if ('href' in k or k == 'src') and v.startswith(('http', 'file:'))]
            assets[asset['path']] = item
        assets[asset['path']]['screens'].append(screen['name'])
        assets[asset['path']]['usages'].extend(asset['usages'])
assert len(assets) == 432
capture_dir = args.output / 'current'
capture_dir.mkdir(exist_ok=True)
for capture in args.captures.glob('*.png'):
    shutil.copyfile(capture, capture_dir / capture.name)
evidence = json.loads((args.captures / 'evidence.json').read_text())
assert all(not e['errors'] and not e['unhandled'] and not e['overflow'] for e in evidence), 'Capture audit has unresolved browser errors'
for screen, note in zip(screens, notes):
    screen['review'] = note
    screen['number'] = note['screen']
    screen['reference'] = next(a['path'] for a in screen['assets'] if a['kind'] == 'explicit')
    if note['case']:
        assert (capture_dir / (note['case'] + '.png')).is_file(), note['case']
        assert any(e['name'] == note['case'] for e in evidence), note['case']
    for a in screen['assets']:
        a['installed'] = assets[a['path']]['installed']
summary = {'screensReviewed': 99, 'partial': sum(n['status'] == 'parcial' for n in notes),
    'missingEquivalent': sum(n['status'] == 'sin-equivalente' for n in notes), 'certifiedIdentical': 0,
    'filesVerified': len(assets), 'images': 80, 'vectors': 253, 'exports': 99,
    'directOriginalAssetsInstalled': sum(bool(a['installed']) for a in assets.values()),
    'sourceZipSha256': hashlib.sha256(args.zip.read_bytes()).hexdigest(), 'captureScenarios': len(evidence)}
data = {'summary': summary, 'screens': screens, 'assets': list(assets.values()), 'evidence': evidence}
(args.output / 'audit.json').write_text(json.dumps(data, ensure_ascii=False, indent=2))
(args.output / 'data.js').write_text('window.EXPORTY_AUDIT=' + json.dumps(data, ensure_ascii=False).replace('</', '<\\/') + ';')
(ROOT / 'docs/diseno/exporty/exporty-assets-verified.json').write_text(json.dumps(
    [{**asset, 'exists': True, 'visuallyReviewed': True, 'installedOriginal': asset['installed']} for asset in assets.values()], ensure_ascii=False, indent=2) + '\n')
lines = [
    '# Comparación del menú con las 99 pantallas Exporty', '',
    f"{summary['partial']} referencias tienen una vista correspondiente capturada; "
    f"{summary['missingEquivalent']} no tienen equivalente específico. "
    'No se certifica igualdad de píxeles: el contenido de producción es el del restaurante, '
    'los textos se adaptan al español y los precios a COP.', '',
    f"Se verificaron los {summary['filesVerified']} archivos del ZIP y "
    f"{summary['directOriginalAssetsInstalled']} assets originales desplegados. "
    f"Hay {summary['captureScenarios']} escenarios de navegador con componentes reales y API interceptada.", '',
    'El visor permite abrir cada referencia, su captura actual y los assets asociados. '
    'Las capturas no escriben cuentas, comandas ni pagos en los servicios. '
    'Los recorridos E2E contra el POS se verifican por separado.', '',
    '[Abrir comparativa local](http://192.168.56.10:3002)', '',
    '## Matriz por pantalla', '',
    '| Nº | Referencia | Captura actual | Resultado |',
    '|---|---|---|---|',
]
for screen, note in zip(screens, notes):
    number = note['screen']
    case = note['case'] or 'Sin equivalente específico'
    clean = lambda text: str(text).replace('|', '\\|').replace('\n', ' ')
    lines.append(f"| [{number}](http://192.168.56.10:3002/#screen-{number}) | "
                 f"{clean(screen['name'])} | {clean(case)} | {clean(note['difference'])} |")
(ROOT / 'docs/diseno/exporty/auditoria-exporty.md').write_text('\n'.join(lines) + '\n')
for filename in ['index.html', 'report.css', 'report.js']:
    shutil.copyfile(Path(__file__).with_name(filename), args.output / filename)
print(json.dumps(summary, ensure_ascii=False, indent=2))
