#!/bin/sh
set -eu
archive='ackrate-agent-reputation-snapshot.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/agent-reputation-snapshot.zip'
node -e "const f='ackrate-agent-reputation-snapshot.zip',e='65ba7d3301d49db0573a184a1416fb9dd49308156478515c4203ae4c9350e4cd',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
