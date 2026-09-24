#!/bin/sh
set -eu
archive='ackrate-model-route-bazaar.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/model-route-bazaar.zip'
node -e "const f='ackrate-model-route-bazaar.zip',e='b5df3f311e407fff1a57aeb267d5237c9d7a56a1db1391d819c5f3329a9b7e4f',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
