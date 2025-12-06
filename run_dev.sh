#!/bin/bash
cp .env.dev .env
set -a
source .env
set +a
flask run --debug --port=5002
