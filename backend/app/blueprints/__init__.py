from . import auth_router, boletas, facturador

# Export tablas if present
try:
	from . import tablas
except Exception:
	tablas = None

# Export afip if present
try:
	from . import afip
except Exception:
	afip = None

# Export setup if present
try:
	from . import setup
except Exception:
	setup = None

__all__ = ["auth_router", "boletas", "facturador", "tablas", "afip", "setup"]
