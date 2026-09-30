#!/usr/bin/env python3
"""Empaqueta el dashboard en UN solo archivo HTML (sin dependencias locales).

Inserta CSS, JS, configuración y logos (como data URI) dentro del HTML, para
poder subirlo/embeberlo igual que el dashboard original de un solo archivo.

Uso:
    python3 build.py                              # todos los proyectos, sin token
    python3 build.py --proyecto cju-p2616         # fija el proyecto (oculta el selector)
    python3 build.py --proyecto cju-p2616 --con-token   # incluye config/secretos.js

Salida: dist/dashboard.html o dist/dashboard-<proyecto>.html
Solo usa la librería estándar de Python.
"""
import argparse
import base64
import mimetypes
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def data_uri(rel):
    path = ROOT / rel
    mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    return 'data:%s;base64,%s' % (mime, base64.b64encode(path.read_bytes()).decode('ascii'))


def inline_assets(js):
    """Reemplaza 'assets/archivo.ext' en el JS de configuración por su data URI."""
    def repl(m):
        rel = m.group(2)
        if not (ROOT / rel).exists():
            sys.exit('No existe el archivo referenciado en la configuración: ' + rel)
        return m.group(1) + data_uri(rel) + m.group(1)
    return re.sub(r"(['\"])(assets/[^'\"]+)\1", repl, js)


def script_tag(code):
    return '<script>\n' + code.replace('</script', '<\\/script') + '\n</script>'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--proyecto', help='clave del proyecto a fijar (ver config/proyectos.js)')
    ap.add_argument('--con-token', action='store_true', help='incluye config/secretos.js dentro del HTML')
    ap.add_argument('--salida', help='ruta del archivo generado')
    args = ap.parse_args()

    config_js = read('config/proyectos.js')
    if args.proyecto and not re.search(r"['\"]%s['\"]\s*:" % re.escape(args.proyecto), config_js):
        sys.exit('El proyecto «%s» no está en config/proyectos.js' % args.proyecto)

    html = read('index.html')

    html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">',
                  lambda m: '<style>\n' + read(m.group(1)) + '\n</style>', html)

    def repl_script(m):
        src = m.group(1)
        if src == 'config/secretos.js':
            if not args.con_token:
                return '<!-- token no incluido (usa --con-token) -->'
            if not (ROOT / src).exists():
                sys.exit('--con-token: no existe config/secretos.js (copia config/secretos.example.js)')
            return script_tag(read(src))
        if src == 'config/proyectos.js':
            forced = ''
            if args.proyecto:
                forced = '\nwindow.DASHBOARD_FORZAR_PROYECTO = %r;' % args.proyecto
            return script_tag(inline_assets(config_js) + forced)
        return script_tag(read(src))

    html = re.sub(r'<script src="((?:js|config)/[^"]+)"></script>', repl_script, html)

    out = Path(args.salida) if args.salida else ROOT / 'dist' / (
        'dashboard-%s.html' % args.proyecto if args.proyecto else 'dashboard.html')
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding='utf-8')
    print('Generado: %s (%.0f KB)%s' % (out, out.stat().st_size / 1024,
          '  ⚠ contiene el token: no lo compartas públicamente' if args.con_token else ''))


if __name__ == '__main__':
    main()
