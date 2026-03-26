import os

class Config:
    def __init__(self):
        self.DATABASE_URL = os.environ.get('DATABASE_URL')
        self.DEBUG = os.environ.get('DEBUG', False)