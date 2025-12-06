#!/bin/bash
cp .env .env
set -a
source .env
set +a
flask run --host=0.0.0.0 --port=5000
