#!/bin/sh
set -eu
archive='ackrate-model-route-bazaar.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/model-route-bazaar.zip'
node -e "const f='ackrate-model-route-bazaar.zip',e='0529662714d242d04f7ee3e948bf20a2786d8e39e291cc12c73feb0b8328757d',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
