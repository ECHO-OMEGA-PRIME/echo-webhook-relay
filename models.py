from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class Webhook(BaseModel):
    id: int
    url: str
    method: str
    headers: dict
    body: str
    created_at: datetime
    updated_at: datetime

class WebhookEvent(BaseModel):
    id: int
    webhook_id: int
    event: str
    payload: dict
    created_at: datetime
    updated_at: datetime

class User(BaseModel):
    id: int
    username: str
    email: str
    password: str
    created_at: datetime
    updated_at: datetime