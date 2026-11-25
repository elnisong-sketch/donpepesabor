# -*- coding: utf-8 -*-
"""
Mete las fotos dentro del propio HTML.

La página se publica como una muestra suelta, sin servidor detrás, así que no
puede pedirle imágenes a nadie: cada foto viaja incrustada en el archivo. Se
reducen antes, que una muestra de 3 MB no la abre nadie desde el móvil.
"""
import base64, io, os
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(AQUI, '..', 'public')

# marcador -> (archivo, ancho máximo, formato)
FOTOS = {
    '__LOGO__': ('logo-donpepe-cartel.png',           120, 'PNG'),
    '__HERO__': ('productos/tequeno-tradicional.webp', 1280, 'JPEG'),
    '__TEQ__':  ('productos/tequeno-guayaba-y-queso.webp', 170, 'JPEG'),
    '__PAS__':  ('productos/pastelito-pollo.webp',     170, 'JPEG'),
    '__EMP__':  ('productos/empanadita-carne.webp',    170, 'JPEG'),
    '__CAC__':  ('productos/cachito-jamon.webp',       170, 'JPEG'),
    '__PAN__':  ('productos/pan-de-jamon.webp',        640, 'JPEG'),
    '__GOL__':  ('productos/golfeados.webp',           640, 'JPEG'),
}

def incrustar(ruta, ancho, formato):
    im = Image.open(os.path.join(PUB, ruta))
    if im.width > ancho:
        im = im.resize((ancho, round(im.height * ancho / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    if formato == 'PNG':
        im.convert('RGBA').save(buf, 'PNG', optimize=True)
        tipo = 'image/png'
    else:
        im.convert('RGB').save(buf, 'JPEG', quality=82, optimize=True, progressive=True)
        tipo = 'image/jpeg'
    datos = buf.getvalue()
    return 'data:%s;base64,%s' % (tipo, base64.b64encode(datos).decode()), len(datos), im.size

html = open(os.path.join(AQUI, 'plantilla.html'), encoding='utf-8').read()
total = 0
for marca, (ruta, ancho, formato) in FOTOS.items():
    uri, peso, tam = incrustar(ruta, ancho, formato)
    if marca not in html:
        raise SystemExit('el marcador %s no está en la plantilla' % marca)
    html = html.replace(marca, uri)
    total += peso
    print('  %-10s %-38s %4dx%-4d %6.1f KB' % (marca, ruta, tam[0], tam[1], peso / 1024))

salida = os.path.join(AQUI, 'index.html')
open(salida, 'w', encoding='utf-8').write(html)
print('\nfotos: %.0f KB · página entera: %.0f KB' % (total / 1024, os.path.getsize(salida) / 1024))
print('guardada:', salida)
