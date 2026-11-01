#!/bin/bash
# (Re)start the two dev servers as detached daemons if they are down.
#   5173 = working tree (/home/user/GameCity)   5174 = frozen baseline (/home/user/GameCity-baseline)
up() { curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$1/" 2>/dev/null; }
if [ "$(up 5173)" != "200" ]; then
  (cd /home/user/GameCity && setsid nohup npx vite --port 5173 --strictPort --host 127.0.0.1 > /home/user/GameCity/shots/vite-5173.log 2>&1 < /dev/null &)
fi
if [ "$(up 5174)" != "200" ] && [ -d /home/user/GameCity-baseline ]; then
  (cd /home/user/GameCity-baseline && setsid nohup npx vite --port 5174 --strictPort --host 127.0.0.1 > /home/user/GameCity/shots/vite-5174.log 2>&1 < /dev/null &)
fi
for i in $(seq 1 40); do [ "$(up 5173)" = "200" ] && [ "$(up 5174)" = "200" ] && break; sleep 0.5; done
echo "5173: $(up 5173)  5174: $(up 5174)"
