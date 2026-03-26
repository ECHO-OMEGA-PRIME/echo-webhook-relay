from sqlalchemy import select
from models import Webhook, WebhookEvent

class QueryBuilder:
    def __init__(self, session):
        self.session = session

    def get_webhooks(self):
        return self.session.query(Webhook).all()

    def get_webhook_events(self, webhook_id):
        return self.session.query(WebhookEvent).filter(WebhookEvent.webhook_id == webhook_id).all()