#!/bin/bash

# Login to Cloudflare
wrangler login --api-token $CLOUDFLARE_API_TOKEN

# Build and deploy
wrangler build
wrangler publish