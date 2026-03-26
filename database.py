from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base

class Database:
    def __init__(self, url):
        self.engine = create_engine(url)
        self.Session = sessionmaker(bind=self.engine)

    def create_tables(self):
        Base.metadata.create_all(self.engine)

    def get_session(self):
        return self.Session()