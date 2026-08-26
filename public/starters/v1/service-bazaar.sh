#!/bin/sh
set -eu
archive='ackrate-service-bazaar.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/service-bazaar.zip'
node -e "const f='ackrate-service-bazaar.zip',e='3c867d2e1baae23a65b27e779d40938c3174f04ee8b61fb994090a452a39ad60',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
