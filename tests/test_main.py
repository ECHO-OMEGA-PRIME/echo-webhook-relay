import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}

def test_webhook_request():
    webhook_request = {
        "event": "test_event",
        "data": {"key": "value"}
    }
    response = client.post("/webhook", json=webhook_request)
    assert response.status_code == 200
    assert response.json() == {"message": "Webhook request received successfully"}