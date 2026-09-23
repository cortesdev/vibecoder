#!/usr/bin/env bash
# THROWAWAY harness. Drives the app's real prompt HTTP surface (auth cookie →
# POST /api/app/projects → POST /api/app/projects/:id/prompt → apply change)
# against a local OpenAI-compatible stub that mirrors the documented Z.ai /
# Google contract. Deleted after the run.
set -u
export PATH="$HOME/.local/node22/bin:$PATH"
COPY=/tmp/vibe-e2e
DB="file:$COPY/e2e.db"
COOKIE="vibecoder_session=e2e-session-token"
STUB=http://127.0.0.1:4599
cd "$COPY"

pkill -f tmp-e2e-stub.mjs 2>/dev/null
pkill -f "next dev -p 331" 2>/dev/null
sleep 1

# pick <json-path>  — read a dotted path out of JSON on stdin
pick() {
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);const v=process.argv[1].split('.').reduce((a,k)=>a==null?a:a[k],j);console.log(typeof v==='object'?JSON.stringify(v):String(v??''))}catch(e){console.log('<unparsable>')}})" "$1"
}

start_dev() { # start_dev PORT LOG EXTRA_ENV...
  local port=$1 log=$2; shift 2
  ( env LICENSE_DB_URL="$DB" VIBECODER_BASE_URL_ZAI="$STUB" "$@" npx next dev -p "$port" > "$log" 2>&1 & )
}
wait_dev() { # wait_dev PORT
  for _ in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$1/login 2>/dev/null)" = "200" ] && return 0
    sleep 1
  done
  echo "  !! dev on $1 never became ready"; tail -5 /tmp/dev$1.log; return 1
}

cleanup() {
  pkill -f "next dev -p 331" 2>/dev/null
  pkill -f tmp-e2e-stub.mjs 2>/dev/null
}
trap cleanup EXIT

STUB_PORT=4599 node tmp-e2e-stub.mjs > /tmp/stub.log 2>&1 &

# devA: platform Z.ai key set (the "platform key works" path)
( env LICENSE_DB_URL="$DB" ZAI_API_KEY="stub-platform-zai-key" VIBECODER_BASE_URL_ZAI="$STUB" \
    npx next dev -p 3311 > /tmp/dev3311.log 2>&1 & )
# devB: no free provider key at all (the unset path)
( env -u ZAI_API_KEY -u GEMINI_API_KEY -u VIBECODER_ZAI_API_KEY -u VIBECODER_GEMINI_API_KEY \
    LICENSE_DB_URL="$DB" VIBECODER_BASE_URL_ZAI="$STUB" \
    npx next dev -p 3312 > /tmp/dev3312.log 2>&1 & )
# devC: key present but EMPTY — exactly what Vercel hands a build
( env LICENSE_DB_URL="$DB" ZAI_API_KEY="" GEMINI_API_KEY="" VIBECODER_BASE_URL_ZAI="$STUB" \
    npx next dev -p 3313 > /tmp/dev3313.log 2>&1 & )

echo "== waiting for the three dev servers =="
wait_dev 3311 && echo "  3311 ready (platform Z.ai key)"
wait_dev 3312 && echo "  3312 ready (no key)"
wait_dev 3313 && echo "  3313 ready (empty key)"

new_project() { # new_project PORT NAME
  curl -s -X POST "http://127.0.0.1:$1/api/app/projects" \
    -H 'content-type: application/json' -H "Cookie: $COOKIE" -d "{\"name\":\"$2\"}"
}
prompt_it() { # prompt_it PORT PID PAYLOAD
  curl -s -w '\n__HTTP__%{http_code}' -X POST "http://127.0.0.1:$1/api/app/projects/$2/prompt" \
    -H 'content-type: application/json' -H "Cookie: $COOKIE" -d "$3"
}
# split body / status from a prompt_it result stored in a variable
body_of() { printf '%s' "$1" | sed 's/__HTTP__[0-9]*$//'; }
code_of() { printf '%s' "$1" | sed -n 's/.*__HTTP__\([0-9]*\)$/\1/p'; }
last_stub() { curl -s $STUB/_requests | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);const l=r[r.length-1]||{};console.log('count='+r.length+' path='+l.path+' auth='+l.authorization+' model='+(l.body&&l.body.model)+' msgs='+(l.body&&l.body.messages&&l.body.messages.length))})"; }

echo
echo "########## A. platform key set: first prompt must answer ##########"
P_A=$(new_project 3311 "E2E platform key"); echo "create: $(printf '%s' "$P_A" | pick project.id)"
A=$(prompt_it 3311 "$(printf '%s' "$P_A" | pick project.id)" '{"prompt":"Change the heading to say hello from the free model"}')
echo "prompt HTTP $(code_of "$A")"
echo "  ok=$(body_of "$A" | pick ok)  modelLabel=$(body_of "$A" | pick modelLabel)  modelId=$(body_of "$A" | pick modelId)"
echo "  notice=$(body_of "$A" | pick notice)"
echo "  change path=$(body_of "$A" | pick prompt.changes.0.path)  status=$(body_of "$A" | pick prompt.changes.0.status)"
echo "  after-has-replacement=$(body_of "$A" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(String(j.prompt.changes[0].after).includes('Hello from the free model'))}catch(e){console.log('n/a')}}")"
echo "  usage=$(body_of "$A" | pick usage.totalTokens)"
echo "  stub saw: $(last_stub)"

CH_A=$(body_of "$A" | pick prompt.changes.0.id)
echo "-- apply the change through the real route --"
curl -s -w ' __HTTP__%{http_code}\n' -X POST "http://127.0.0.1:3311/api/app/projects/$(printf '%s' "$P_A" | pick project.id)/changes/$CH_A/apply" -H "Cookie: $COOKIE"

echo
echo "########## A2. DB state after the run ##########"
LICENSE_DB_URL="$DB" node -e "
const { createClient } = require('/Users/ricardo/Documents/GitHub/VibeCoder/node_modules/@libsql/client');
(async () => {
  const c = createClient({ url: '$DB' });
  const p = await c.execute(\"select count(*) n from Prompt\");
  const ch = await c.execute(\"select path, status, substr(after,1,0) x from Change order by createdAt desc limit 2\");
  const f = await c.execute(\"select content from ProjectFile where path='src/App.tsx'\");
  const ct = await c.execute(\"select count(*) n from CreditTxn\");
  const ft = await c.execute(\"select count(*) n from FreeTxn\");
  console.log('Prompt rows      =', p.rows[0].n);
  console.log('latest Change    =', JSON.stringify(ch.rows[0]));
  console.log('App.tsx applied  =', String(f.rows[0].content).includes('Hello from the free model'));
  console.log('CreditTxn rows   =', ct.rows[0].n, '(free run must not touch credits)');
  console.log('FreeTxn rows     =', ft.rows[0].n, '(free run must not touch the free-token wallet)');
})();"

echo
echo "########## B. BYO key (Settings) must beat the platform key ##########"
echo "save google provider key (Gemini is in the model registry as BYO):"
curl -s -w ' __HTTP__%{http_code}\n' -X POST http://127.0.0.1:3311/api/app/keys -H 'content-type: application/json' -H "Cookie: $COOKIE" -d '{"provider":"google","key":"byo-user-gemini-key"}'
echo "save zai provider key:"
curl -s -w ' __HTTP__%{http_code}\n' -X POST http://127.0.0.1:3311/api/app/keys -H 'content-type: application/json' -H "Cookie: $COOKIE" -d '{"provider":"zai","key":"byo-user-zai-key"}'
P_B=$(new_project 3311 "E2E byo key")
B=$(prompt_it 3311 "$(printf '%s' "$P_B" | pick project.id)" '{"prompt":"Say hello from my own key"}')
echo "prompt HTTP $(code_of "$B") ok=$(body_of "$B" | pick ok) modelLabel=$(body_of "$B" | pick modelLabel)"
echo "  stub saw: $(last_stub)   <- auth must be the USER key"
echo "  providers listed: $(curl -s http://127.0.0.1:3311/api/app/keys -H "Cookie: $COOKIE" | pick providers)"

echo
echo "########## C. no key at all: message must be actionable, not a raw 403 ##########"
P_C=$(new_project 3312 "E2E no key")
C=$(prompt_it 3312 "$(printf '%s' "$P_C" | pick project.id)" '{"prompt":"build me a landing page"}')
echo "prompt HTTP $(code_of "$C")"
echo "  error: $(body_of "$C" | pick error)"
echo "  stub hits during no-key run: $(curl -s $STUB/_requests | pick 0.path) (should be unchanged)"

echo
echo "########## D. EMPTY key (Vercel empty string) behaves like unset ##########"
P_D=$(new_project 3313 "E2E empty key")
D=$(prompt_it 3313 "$(printf '%s' "$P_D" | pick project.id)" '{"prompt":"build me a landing page"}')
echo "prompt HTTP $(code_of "$D")"
echo "  error: $(body_of "$D" | pick error)"

echo
echo "########## E. provider REJECTS the key: message must name provider, quote it, say the fix ##########"
curl -s -o /dev/null -X POST "$STUB/_mode?v=401"
E=$(prompt_it 3311 "$(printf '%s' "$P_A" | pick project.id)" '{"prompt":"second prompt"}')
echo "prompt HTTP $(code_of "$E")"
echo "  error: $(body_of "$E" | pick error)"
echo "-- 403 mode --"
curl -s -o /dev/null -X POST "$STUB/_mode?v=403"
E2=$(prompt_it 3311 "$(printf '%s' "$P_A" | pick project.id)" '{"prompt":"third prompt"}')
echo "prompt HTTP $(code_of "$E2")"
echo "  error: $(body_of "$E2" | pick error)"
echo "-- 429 (rate limit / quota spent) --"
curl -s -o /dev/null -X POST "$STUB/_mode?v=429"
E3=$(prompt_it 3311 "$(printf '%s' "$P_A" | pick project.id)" '{"prompt":"fourth prompt"}')
echo "prompt HTTP $(code_of "$E3")"
echo "  error: $(body_of "$E3" | pick error)"
curl -s -o /dev/null -X POST "$STUB/_mode?v=ok"

echo
echo "########## F. billing: free run leaves wallet alone; paid run debits ##########"
LICENSE_DB_URL="$DB" node -e "
const { createClient } = require('/Users/ricardo/Documents/GitHub/VibeCoder/node_modules/@libsql/client');
(async () => {
  const c = createClient({ url: '$DB' });
  const pt = await c.execute('select count(*) n from Prompt');
  const ft = await c.execute('select count(*) n from FreeTxn');
  const ct = await c.execute('select count(*) n from CreditTxn');
  const w = await c.execute('select count(*) n from CreditWallet');
  console.log('Prompt rows =', pt.rows[0].n, '| FreeTxn =', ft.rows[0].n, '| CreditTxn =', ct.rows[0].n, '| CreditWallet =', w.rows[0].n);
})();"
echo
echo "########## dev logs: any unhandled errors? ##########"
grep -iE "error|unhandled|✗" /tmp/dev3311.log | grep -vE "^\s*$" | head -10 || echo "  (none in 3311)"
