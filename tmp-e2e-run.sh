#!/usr/bin/env bash
# THROWAWAY harness. Drives the app's real prompt HTTP surface (auth cookie ->
# POST /api/app/projects -> POST /api/app/projects/:id/prompt -> apply change)
# against a local OpenAI-compatible stub that mirrors the documented Z.ai /
# Google contract. Next.js allows one dev server per project directory, so the
# three key configurations (set / unset / empty) run sequentially on one port.
# Deleted after the run.
set -u
export PATH="$HOME/.local/node22/bin:$PATH"
COPY=/tmp/vibe-e2e
DB="file:$COPY/e2e.db"
COOKIE="vibecoder_session=e2e-session-token"
STUB="http://127.0.0.1:4599"
PORT=3311
BASE="http://127.0.0.1:$PORT"
cd "$COPY"

pkill -f tmp-e2e-stub.mjs 2>/dev/null
pkill -f "next dev -p $PORT" 2>/dev/null
for _ in $(seq 1 20); do lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 1; done

pick() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);const v=process.argv[1].split('.').reduce((a,k)=>a==null?a:a[k],j);console.log(typeof v==='object'?JSON.stringify(v):String(v??''))}catch(e){console.log('<unparsable>')}})" "$1" 2>/dev/null; }
body_of() { printf '%s' "$1" | sed 's/__HTTP__[0-9]*$//'; }
code_of() { printf '%s' "$1" | sed -n 's/.*__HTTP__\([0-9]*\)$/\1/p'; }
last_stub() { curl -s $STUB/_requests | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);const l=r[r.length-1]||{};console.log('count='+r.length+' path='+l.path+' auth='+l.authorization+' model='+(l.body&&l.body.model)+' msgs='+(l.body&&l.body.messages&&l.body.messages.length))})"; }
new_project() { curl -s -X POST "$BASE/api/app/projects" -H 'content-type: application/json' -H "Cookie: $COOKIE" -d "{\"name\":\"$1\"}"; }
prompt_it() { curl -s -w '\n__HTTP__%{http_code}' -X POST "$BASE/api/app/projects/$1/prompt" -H 'content-type: application/json' -H "Cookie: $COOKIE" -d "$2"; }
has_after() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(String(j.prompt.changes[0].after).includes('Hello from the free model'))}catch(e){console.log('n/a')}})"; }

start_dev() { # start_dev LABEL ENVASSIGNMENTS...
  local label=$1; shift
  ( env LICENSE_DB_URL="$DB" VIBECODER_BASE_URL_ZAI="$STUB" "$@" npx next dev -p $PORT > "/tmp/dev-$label.log" 2>&1 & )
  for _ in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' $BASE/login 2>/dev/null)" = "200" ] && { echo "  [$label] dev ready on $PORT"; return 0; }
    sleep 1
  done
  echo "  [$label] !! dev never became ready"; tail -6 "/tmp/dev-$label.log"; return 1
}
stop_dev() { pkill -f "next dev -p $PORT" 2>/dev/null; for _ in $(seq 1 25); do lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 || { sleep 1; return 0; }; sleep 1; done; }
cleanup() { pkill -f "next dev -p $PORT" 2>/dev/null; pkill -f tmp-e2e-stub.mjs 2>/dev/null; }
trap cleanup EXIT

STUB_PORT=4599 node tmp-e2e-stub.mjs > /tmp/stub.log 2>&1 &

########################################################################
echo
echo "########## PHASE 1 — platform key comes from the environment ##########"
start_dev platform ZAI_API_KEY=stub-platform-zai-key

echo
echo "-- A. create project, then the FIRST prompt (no modelId → default) --"
P_A=$(new_project "E2E platform key"); PID_A=$(printf '%s' "$P_A" | pick project.id)
echo "   project id: $PID_A"
A=$(prompt_it "$PID_A" '{"prompt":"Change the heading to say hello from the free model"}')
echo "   HTTP $(code_of "$A")  ok=$(body_of "$A" | pick ok)  model=$(body_of "$A" | pick modelLabel)  usage=$(body_of "$A" | pick usage.totalTokens)"
echo "   change: $(body_of "$A" | pick prompt.changes.0.path) [$(body_of "$A" | pick prompt.changes.0.status)]"
echo "   after contains the replacement: $(body_of "$A" | has_after)"
echo "   stub saw: $(last_stub)"
CH_A=$(body_of "$A" | pick prompt.changes.0.id)
echo "   apply via real route: $(curl -s -w ' __HTTP__%{http_code}' -X POST "$BASE/api/app/projects/$PID_A/changes/$CH_A/apply" -H "Cookie: $COOKIE")"

echo
echo "-- A2. recorded state in the DB --"
LICENSE_DB_URL="$DB" node -e "
const { createClient } = require('/Users/ricardo/Documents/GitHub/VibeCoder/node_modules/@libsql/client');
(async () => {
  const c = createClient({ url: '$DB' });
  const q = async (s) => (await c.execute(s)).rows;
  console.log('   Prompt rows                =', (await q('select count(*) n from Prompt'))[0].n);
  console.log('   latest Change              =', JSON.stringify((await q(\"select path, status from Change order by createdAt desc limit 1\"))[0]));
  console.log('   App.tsx has the new text   =', String((await q(\"select content from ProjectFile where path='src/App.tsx'\"))[0].content).includes('Hello from the free model'));
  console.log('   CreditTxn rows             =', (await q('select count(*) n from CreditTxn'))[0].n, '(a free run must not bill credits)');
  console.log('   FreeTxn rows               =', (await q('select count(*) n from FreeTxn'))[0].n, '(a free run must not touch the free-token wallet)');
})();"

echo
echo "-- B. BYO key saved in Settings must win over the platform key --"
echo "   save google (Gemini) key: $(curl -s -w ' __HTTP__%{http_code}' -X POST $BASE/api/app/keys -H 'content-type: application/json' -H "Cookie: $COOKIE" -d '{"provider":"google","key":"byo-user-gemini-key"}')"
echo "   save zai key:             $(curl -s -w ' __HTTP__%{http_code}' -X POST $BASE/api/app/keys -H 'content-type: application/json' -H "Cookie: $COOKIE" -d '{"provider":"zai","key":"byo-user-zai-key"}')"
P_B=$(new_project "E2E byo key"); PID_B=$(printf '%s' "$P_B" | pick project.id)
B=$(prompt_it "$PID_B" '{"prompt":"Say hello from my own key"}')
echo "   HTTP $(code_of "$B")  ok=$(body_of "$B" | pick ok)  model=$(body_of "$B" | pick modelLabel)"
echo "   stub saw: $(last_stub)   <- auth must be the USER key"
echo "   providers listed: $(curl -s $BASE/api/app/keys -H "Cookie: $COOKIE" | pick providers)"

echo
echo "-- C. provider rejects the key: error must name it, quote it, and say the fix --"
for MODE in 401 403 429; do
  curl -s -o /dev/null -X POST "$STUB/_mode?v=$MODE"
  R=$(prompt_it "$PID_A" '{"prompt":"what happens when the provider refuses"}')
  echo "   [$MODE] HTTP $(code_of "$R")"
  echo "        $(body_of "$R" | pick error)"
done
curl -s -o /dev/null -X POST "$STUB/_mode?v=ok"

echo
echo "-- D. pick a free model explicitly (gemini-flash has no zai key, so it must chain) --"
D=$(prompt_it "$PID_B" '{"prompt":"run on gemini","modelId":"gemini-flash"}')
echo "   HTTP $(code_of "$D")  ok=$(body_of "$D" | pick ok)  model=$(body_of "$D" | pick modelLabel)  notice=$(body_of "$D" | pick notice)"

stop_dev

########################################################################
echo
echo "########## PHASE 2 — NO free provider key anywhere ##########"
start_dev nokey env -u ZAI_API_KEY -u GEMINI_API_KEY -u VIBECODER_ZAI_API_KEY -u VIBECODER_GEMINI_API_KEY -u OPENCODE_API_KEY
P_N=$(new_project "E2E no key"); PID_N=$(printf '%s' "$P_N" | pick project.id)
BEFORE=$(curl -s $STUB/_requests | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).length))")
N=$(prompt_it "$PID_N" '{"prompt":"build me a landing page"}')
AFTER=$(curl -s $STUB/_requests | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).length))")
echo "   HTTP $(code_of "$N")  ok=$(body_of "$N" | pick ok)"
echo "   error: $(body_of "$N" | pick error)"
echo "   provider calls made while unconfigured: $((AFTER-BEFORE)) (must be 0)"
stop_dev

########################################################################
echo
echo "########## PHASE 3 — key present but EMPTY (what Vercel hands a build) ##########"
start_dev emptykey ZAI_API_KEY= GEMINI_API_KEY=
P_E=$(new_project "E2E empty key"); PID_E=$(printf '%s' "$P_E" | pick project.id)
E=$(prompt_it "$PID_E" '{"prompt":"build me a landing page"}')
echo "   HTTP $(code_of "$E")  ok=$(body_of "$E" | pick ok)"
echo "   error: $(body_of "$E" | pick error)"
stop_dev

echo
echo "########## PHASE 4 — final billing state + dev log errors ##########"
LICENSE_DB_URL="$DB" node -e "
const { createClient } = require('/Users/ricardo/Documents/GitHub/VibeCoder/node_modules/@libsql/client');
(async () => {
  const c = createClient({ url: '$DB' });
  const q = async (s) => (await c.execute(s)).rows;
  console.log('   Prompt rows =', (await q('select count(*) n from Prompt'))[0].n,
              '| ProjectFile rows =', (await q('select count(*) n from ProjectFile'))[0].n,
              '| CreditTxn =', (await q('select count(*) n from CreditTxn'))[0].n,
              '| FreeTxn =', (await q('select count(*) n from FreeTxn'))[0].n);
})();"
echo "   unhandled errors in dev logs:"
grep -ihE "^ *[✗×]|unhandled|Error:" /tmp/dev-platform.log /tmp/dev-nokey.log /tmp/dev-emptykey.log 2>/dev/null | grep -v "POST /api" | head -8 || echo "     (none)"
