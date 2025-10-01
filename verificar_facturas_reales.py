#!/usr/bin/env python3
"""
Script para verificar facturas reales emitidas con CAE
"""
from backend.database import SessionLocal
from backend.modelos import FacturaElectronica
from datetime import datetime, timedelta

db = SessionLocal()

# Facturas de las últimas 24 horas
ayer = datetime.now() - timedelta(hours=24)
facturas = db.query(FacturaElectronica).filter(
    FacturaElectronica.fecha_comprobante >= ayer.date()
).order_by(FacturaElectronica.id.desc()).limit(10).all()

print('\n' + '='*70)
print('  VERIFICACIÓN DE FACTURAS REALES CON CAE (últimas 24 horas)')
print('='*70 + '\n')

if not facturas:
    print('⚠️  No se encontraron facturas en las últimas 24 horas.')
    print('   Mostrando las últimas 10 facturas de todos los tiempos...\n')
    facturas = db.query(FacturaElectronica).order_by(
        FacturaElectronica.id.desc()
    ).limit(10).all()

for i, f in enumerate(facturas, 1):
    print(f'📄 FACTURA #{i}')
    print(f'   ID Sistema: {f.id}')
    print(f'   ✅ CAE: {f.cae}')
    print(f'   📅 Vencimiento CAE: {f.vencimiento_cae}')
    print(f'   📋 Tipo: {f.tipo_comprobante} | Número: {f.numero_comprobante}')
    print(f'   🏢 CUIT Emisor: {f.cuit_emisor}')
    print(f'   💰 Importe Total: ${f.importe_total}')
    print(f'   � Fecha Comprobante: {f.fecha_comprobante}')
    print(f'   🆔 Ingreso ID: {f.ingreso_id}')
    if f.qr_url_afip:
        print(f'   🔗 QR AFIP: {f.qr_url_afip[:50]}...')
    print('-' * 70)

print(f'\n✨ Total encontradas: {len(facturas)} facturas')
print('='*70 + '\n')

db.close()
