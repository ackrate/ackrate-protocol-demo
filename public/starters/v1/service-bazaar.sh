#!/bin/sh
set -eu
archive='ackrate-service-bazaar.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/service-bazaar.zip'
node -e "const f='ackrate-service-bazaar.zip',e='79274cd35c1dfd6c057a3f475c4476a81a003c2e866db1210f32bc755c32241d',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
