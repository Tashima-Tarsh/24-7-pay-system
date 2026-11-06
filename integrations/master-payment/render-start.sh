#!/usr/bin/env bash
set -euo pipefail
export MONGO_URI='mongodb://127.0.0.1:27017/sanbookpay_master?replicaSet=rs0'
export REDIS_URL='redis://127.0.0.1:6379'
export ADMIN_IP_WHITELIST='127.0.0.1,::1'
export BANK_WEBHOOK_IPS='127.0.0.1,::1'
export API_INTERNAL_URL='http://127.0.0.1:3000'
export PORTAL_ORIGIN="$RENDER_EXTERNAL_URL"

mkdir -p /var/data/mongo /var/data/redis
mongod --bind_ip 127.0.0.1 --replSet rs0 --wiredTigerCacheSizeGB 0.25 --dbpath /var/data/mongo --logpath /tmp/mongod.log &
redis-server --bind 127.0.0.1 --protected-mode yes --appendonly yes --dir /var/data/redis --maxmemory 128mb --maxmemory-policy noeviction &
for ((i=0; i<60; i++)); do
  if mongosh --quiet --eval 'try {rs.status()} catch (e) {if (e.code !== 94) throw e; rs.initiate({_id:"rs0", members:[{_id:0, host:"127.0.0.1:27017"}]})}; if (!db.hello().isWritablePrimary) quit(1)' >/dev/null 2>&1 && redis-cli ping | grep -qx PONG; then
    ready=1
    break
  fi
  sleep 1
done
test "${ready:-0}" = 1
(cd /app/api; node render-bootstrap.mjs; PORT=3000 exec node dist/index.js) &
(cd /app/portal; exec node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3100) &
node /app/render-gateway.mjs &
wait -n
exit 1
