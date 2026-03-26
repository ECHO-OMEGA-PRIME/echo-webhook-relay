from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Webhook, User

def seed_data():
    engine = create_engine('postgresql://user:password@localhost:5432/echo-webhook-relay')
    Session = sessionmaker(bind=engine)
    session = Session()

    user = User(username='admin', email='admin@example.com', password='password')
    session.add(user)
    session.commit()

    webhook = Webhook(url='https://example.com/webhook', method='POST', headers={}, body='{}')
    session.add(webhook)
    session.commit()