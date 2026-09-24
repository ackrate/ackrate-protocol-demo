#!/bin/sh
set -eu
archive='ackrate-service-bazaar.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/service-bazaar.zip'
node -e "const f='ackrate-service-bazaar.zip',e='621a71ec5fab30687ceaa3262a7b05e06bf78038764f8078675d629a2acf74a8',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
