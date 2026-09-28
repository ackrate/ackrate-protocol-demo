#!/bin/sh
set -eu
archive='ackrate-model-route-bazaar.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/model-route-bazaar.zip'
node -e "const f='ackrate-model-route-bazaar.zip',e='4f11a2e9369ec9a1522563f4f75a0d630d90fafa27443a4ae041b2896c99d2a3',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
