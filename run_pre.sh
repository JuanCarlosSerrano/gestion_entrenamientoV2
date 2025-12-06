#!/bin/bash
cp .env.pre .env
set -a
source .env
set +a
flask run --debug --port=5001
