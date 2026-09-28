#!/bin/sh
set -eu
archive='ackrate-model-route-bazaar.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/model-route-bazaar.zip'
node -e "const f='ackrate-model-route-bazaar.zip',e='ae0439ffc414edcb39bb74b41c9680611ee8f46cffdebe14892356e88163ba79',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
