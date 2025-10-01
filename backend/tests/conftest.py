import os, sys, pathlib
import pytest
from fastapi.testclient import TestClient

# Asegurar que el root del repo esté en sys.path para importar 'backend'
ROOT = pathlib.Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("API_PREFIX", "")

from backend.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    return TestClient(app)
