#!/bin/sh
set -eu
archive='ackrate-agent-reputation-snapshot.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/agent-reputation-snapshot.zip'
node -e "const f='ackrate-agent-reputation-snapshot.zip',e='a403ae5a261de5c6d1df2f71f0af302b0beda2b69c4003e5b5976d37f865b8a4',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
