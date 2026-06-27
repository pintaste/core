#!/bin/bash
cd /home/ubuntu/mx-core/apps/core
set -a
source /home/ubuntu/mx-core/.env
set +a
export BETTER_AUTH_TRUSTED_ORIGINS="https://admin.pinw.ca,https://api.pinw.ca"
exec node out/main.mjs
