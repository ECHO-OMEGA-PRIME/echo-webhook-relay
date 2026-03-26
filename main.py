import os
import logging
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from loguru import logger

# Set up logging
logger.add("logs/echo-webhook-relay.log", rotation="1 week")

app = FastAPI()

class WebhookRequest(BaseModel):
    event: str
    data: dict

@app.post("/webhook")
async def handle_webhook(request: Request, webhook_request: WebhookRequest):
    try:
        # Process webhook request
        logger.info(f"Received webhook request: {webhook_request}")
        return JSONResponse(content={"message": "Webhook request received successfully"}, status_code=200)
    except Exception as e:
        logger.error(f"Error handling webhook request: {e}")
        return JSONResponse(content={"error": "Internal Server Error"}, status_code=500)

@app.get("/health")
async def health_check():
    return JSONResponse(content={"status": "healthy"}, status_code=200)