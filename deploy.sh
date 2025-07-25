#!/bin/bash
set -e
if [ -z "$PROD_PALETTE_KV_ID" ]; then
  echo "Error: Environment variable PROD_PALETTE_KV_ID is not set." >&2
  exit 1
fi
if [ -z "$PROD_PALETTE_KV_PREVIEW_ID" ]; then
  echo "Error: Environment variable PROD_PALETTE_KV_PREVIEW_ID is not set." >&2
  exit 1
fi
if [ -z "$DEV_PALETTE_KV_ID" ]; then
  echo "Error: Environment variable DEV_PALETTE_KV_ID is not set." >&2
  exit 1
fi
if [ -z "$SECRETS_STORE_ID" ]; then
  echo "Error: Environment variable SECRETS_STORE_ID is not set." >&2
  exit 1
fi

ENVIRONMENT="dev"
if [ -n "$1" ]; then
  ENVIRONMENT=$1
fi

echo "--- Preparing to deploy to the '$ENVIRONMENT' environment ---"

sed \
  -e "s|__PALETTE_KV_ID__|${PROD_PALETTE_KV_ID}|g" \
  -e "s|__PALETTE_KV_PREVIEW_ID__|${PROD_PALETTE_KV_PREVIEW_ID}|g" \
  -e "s|__DEV_PALETTE_KV_ID__|${DEV_PALETTE_KV_ID}|g" \
  -e "s|__SECRETS_STORE_ID__|${SECRETS_STORE_ID}|g" \
  wrangler.toml.template > wrangler.toml

echo "Generated wrangler.toml from template."

if [ "$ENVIRONMENT" == "prod" ]; then
  echo "Deploying production worker..."
  npx wrangler deploy --env=""
elif [ "$ENVIRONMENT" == "dev" ]; then
  echo "Deploying dev worker..."
  npx wrangler deploy --env="dev"
else
  echo "Error: Unknown environment '$ENVIRONMENT'. Use 'prod' or 'dev'."
  rm wrangler.toml
  exit 1
fi

echo "Cleaning up generated files..."
rm wrangler.toml

echo "--- Deployment to '$ENVIRONMENT' complete! ---"
