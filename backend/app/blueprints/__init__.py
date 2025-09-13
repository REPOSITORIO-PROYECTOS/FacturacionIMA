from . import auth_router, boletas, facturador

# Export tablas if present
try:
	from . import tablas
except Exception:
	tablas = None

__all__ = ["auth_router", "boletas", "facturador", "tablas"]
