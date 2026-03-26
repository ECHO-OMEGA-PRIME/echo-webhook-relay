from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base

def create_tables():
    engine = create_engine('postgresql://user:password@localhost:5432/echo-webhook-relay')
    Base.metadata.create_all(engine)