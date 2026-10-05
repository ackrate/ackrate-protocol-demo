#!/bin/sh
set -eu
archive='ackrate-agent-reputation-snapshot.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/agent-reputation-snapshot.zip'
node -e "const f='ackrate-agent-reputation-snapshot.zip',e='33db5b63c2d46b5285868c4bbafc863959b8f5a0362508b4cc0c76ce256d2f35',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
