import sys
import os
import json
from datetime import datetime, timedelta
from typing import List, Dict, Any

# Add project root to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal
from backend.modelos import FacturaElectronica
from sqlmodel import select

def audit_invoices(days_back=3):
    print(f"=== AUDITORÍA DE FACTURAS (Últimos {days_back} días) ===")
    
    db = SessionLocal()
    try:
        # 1. Fetch invoices from DB
        since_date = datetime.now().date() - timedelta(days=days_back)
        print(f"Buscando facturas desde: {since_date}")
        
        # Note: fecha_comprobante might be stored as string or date in DB depending on implementation
        # We'll fetch all and filter in python to be safe or use SQL filter if sure about type
        all_invoices = db.exec(select(FacturaElectronica)).all()
        
        recent_invoices = []
        for inv in all_invoices:
            inv_date = inv.fecha_comprobante
            if isinstance(inv_date, str):
                try:
                    inv_date = datetime.fromisoformat(inv_date).date()
                except:
                    continue
            elif isinstance(inv_date, datetime):
                inv_date = inv_date.date()
            
            if inv_date and inv_date >= since_date:
                recent_invoices.append(inv)
        
        print(f"Encontradas {len(recent_invoices)} facturas en la Base de Datos.")
        
        db_map = {str(inv.ingreso_id): inv for inv in recent_invoices}
        
        # 2. Check batch logs
        testing_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', 'testing')
        if not os.path.exists(testing_dir):
            print("No testing directory found.")
            return

        batch_files = sorted([f for f in os.listdir(testing_dir) if f.startswith("batch_results_")])
        
        print(f"\nAnalizando {len(batch_files)} archivos de log de lotes...")
        
        issues_found = 0
        
        for b_file in batch_files:
            file_path = os.path.join(testing_dir, b_file)
            file_date_str = b_file.replace("batch_results_", "").replace(".json", "").split("_")[0]
            try:
                file_date = datetime.strptime(file_date_str, "%Y%m%d").date()
                if file_date < since_date:
                    continue
            except:
                pass

            print(f"  -> Revisando {b_file}...")
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    results = json.load(f)
                
                for item in results:
                    status = item.get('status')
                    inv_id = item.get('id')
                    
                    if status == 'SUCCESS':
                        # Check if in DB
                        if str(inv_id) not in db_map:
                            # It might be a test ID
                            if "test" in str(inv_id).lower() or "fake" in str(inv_id).lower():
                                continue
                                
                            print(f"     ❌ ALERTA: Factura ID {inv_id} está SUCCESS en log pero NO en BD.")
                            print(f"        Detalle: CAE {item.get('result', {}).get('cae')}, Total: {item.get('result', {}).get('total')}")
                            issues_found += 1
                        else:
                            # Exists in DB, check consistency
                            db_inv = db_map[str(inv_id)]
                            log_cae = item.get('result', {}).get('cae')
                            if str(db_inv.cae) != str(log_cae):
                                print(f"     ⚠️ DIFERENCIA: ID {inv_id} CAE DB={db_inv.cae} vs LOG={log_cae}")
                                issues_found += 1
                                
            except Exception as e:
                print(f"     Error leyendo archivo: {e}")

        if issues_found == 0:
            print("\n✅ No se encontraron discrepancias entre los logs exitosos y la base de datos.")
        else:
            print(f"\n⚠️ Se encontraron {issues_found} problemas potenciales.")

        # 3. List DB invoices for manual review
        print("\n--- Listado de Facturas en BD (Últimos días) ---")
        print(f"{'ID Ingreso':<25} | {'Fecha':<12} | {'Tipo':<4} | {'Pto Vta':<4} | {'Número':<8} | {'CAE':<16} | {'Total':<10}")
        print("-" * 100)
        for inv in sorted(recent_invoices, key=lambda x: x.fecha_comprobante if x.fecha_comprobante else date.min, reverse=True):
            f_str = str(inv.fecha_comprobante)
            total = f"${inv.importe_total:.2f}" if inv.importe_total else "-"
            print(f"{str(inv.ingreso_id):<25} | {f_str:<12} | {str(inv.tipo_comprobante):<4} | {str(inv.punto_venta):<4} | {str(inv.numero_comprobante):<8} | {str(inv.cae):<16} | {total:<10}")

    finally:
        db.close()

if __name__ == "__main__":
    audit_invoices()
