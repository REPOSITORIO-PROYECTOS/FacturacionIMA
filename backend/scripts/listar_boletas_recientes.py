import sys
import os
from datetime import datetime

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, project_root)

from backend.utils.tablasHandler import TablasHandler

def _fecha_key(raw: str) -> int:
    t = str(raw or '').strip()
    base = t.split(' ')[0].split('T')[0]
    try:
        if len(base) == 10 and base[4] == '-' and base[7] == '-':
            dt = datetime.strptime(base, '%Y-%m-%d')
            return int(dt.strftime('%Y%m%d'))
        if len(base) == 10 and base[2] == '/' and base[5] == '/':
            dt = datetime.strptime(base, '%d/%m/%Y')
            return int(dt.strftime('%Y%m%d'))
    except Exception:
        return 0
    return 0

def main():
    h = TablasHandler()
    data = h.cargar_ingresos()
    if not isinstance(data, list) or len(data) == 0:
        print('SIN_DATOS')
        return
    data.sort(key=lambda b: _fecha_key(str(b.get('Fecha') or b.get('fecha') or b.get('FECHA') or '')) , reverse=True)
    total = len(data)
    print(f'TOTAL_BOLETAS={total}')
    top = data[:25]
    for i, b in enumerate(top, start=1):
        fid = b.get('ID Ingresos') or b.get('id_ingreso') or b.get('id') or ''
        fch = b.get('Fecha') or b.get('fecha') or ''
        rz = b.get('Razon Social') or b.get('razon_social') or ''
        rep = b.get('Repartidor') or b.get('repartidor') or ''
        tot = b.get('importe_total') or b.get('INGRESOS') or b.get('total') or ''
        est = b.get('facturacion') or b.get('Facturacion') or ''
        print(f'{i}. ID={fid} | Fecha={fch} | Razon={rz} | Rep={rep} | Total={tot} | Estado={est}')

if __name__ == '__main__':
    main()

