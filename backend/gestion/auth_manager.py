from sqlmodel import Session, select
from backend.modelos import Usuario
# Importamos la función de seguridad para verificar contraseñas
from backend.security import verificar_password

def autenticar_usuario(db: Session, username: str, password: str) -> Usuario | None:
    """
    Busca un usuario por su nombre, verifica su contraseña y su estado.
    Ahora también verifica que el usuario tenga un rol y esté activo.
    Devuelve el objeto Usuario completo si todo es correcto, o None si algo falla.
    """
    # 1. Buscar al usuario en la base de datos
    statement = select(Usuario).where(Usuario.nombre_usuario == username)
    usuario = db.exec(statement).first()

    # 2. Verificar que el usuario existe Y que la contraseña es correcta
    if not usuario or not verificar_password(password, usuario.password_hash):
        return None  # Usuario no encontrado o contraseña incorrecta

    # 3. VERIFICACIÓN DE SEGURIDAD CRÍTICA: Asegurarse de que el usuario está activo y tiene rol
    if not usuario.activo or not usuario.rol:
        return None # Si el usuario está inactivo o no tiene rol, no se le permite el login

    # 4. Si todas las validaciones pasan, devolver el objeto usuario
    return usuario