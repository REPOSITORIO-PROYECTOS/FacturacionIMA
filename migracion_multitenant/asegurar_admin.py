import sys
import os

# Añadir el directorio padre al path para poder importar backend
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

from sqlmodel import Session, select
from backend.database import SessionLocal
from backend.modelos import Empresa, Usuario, Rol
from werkzeug.security import generate_password_hash

def asegurar_usuario_admin():
    with SessionLocal() as db:
        print("=== ASEGURANDO USUARIO ADMIN GLOBAL ===")

        # Verificar si existe el rol Admin
        rol_admin = db.exec(select(Rol).where(Rol.nombre == "Admin")).first()
        if not rol_admin:
            rol_admin = Rol(nombre="Admin")
            db.add(rol_admin)
            db.commit()
            db.refresh(rol_admin)
            print("Rol 'Admin' creado")

        # Verificar si existe la empresa principal
        empresa_principal = db.exec(select(Empresa).where(Empresa.nombre_legal == "Empresa Principal")).first()
        if not empresa_principal:
            empresa_principal = Empresa(
                nombre_legal="Empresa Principal",
                cuit="00000000000",  # CUIT genérico
                activa=True
            )
            db.add(empresa_principal)
            db.commit()
            db.refresh(empresa_principal)
            print("Empresa principal creada")

        # Verificar si existe el usuario AdminFacturacion
        admin_user = db.exec(select(Usuario).where(Usuario.nombre_usuario == "AdminFacturacion")).first()
        if not admin_user:
            admin_user = Usuario(
                nombre_usuario="AdminFacturacion",
                password_hash=generate_password_hash("Soporte123"),
                activo=True,
                id_rol=rol_admin.id,
                id_empresa=empresa_principal.id  # Asignado a empresa principal
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
            print("Usuario AdminFacturacion creado")
        else:
            print("Usuario AdminFacturacion ya existe")

        # Asignar empresa a usuarios sin empresa
        usuarios_sin_empresa = db.exec(select(Usuario).where(Usuario.id_empresa.is_(None))).all()
        for usuario in usuarios_sin_empresa:
            usuario.id_empresa = empresa_principal.id
            print(f"Asignando empresa principal a usuario: {usuario.nombre_usuario}")

        db.commit()
        print("✅ Usuario admin global asegurado")

if __name__ == "__main__":
    asegurar_usuario_admin()