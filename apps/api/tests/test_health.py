# tests/test_health.py
from fastapi.testclient import TestClient

from crm_api.main import create_app
from crm_api.settings import Settings


def test_health_ok() -> None:
    # No database configured → lifespan is a no-op; /health still works.
    app = create_app(Settings(database_url=None))
    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok", "service": "crm-api"}
