#!/bin/sh
set -eu
archive='reapp-agent-reputation-snapshot.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/agent-reputation-snapshot.zip'
node -e "const f='reapp-agent-reputation-snapshot.zip',e='71ee9274e44ea42ce9c010f3d9d89d27ae88b9025fa08042aebd40807d774409',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nREAPP starter installed. Run: npm run demo\n'
