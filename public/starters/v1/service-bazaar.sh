#!/bin/sh
set -eu
archive='ackrate-service-bazaar.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/service-bazaar.zip'
node -e "const f='ackrate-service-bazaar.zip',e='d93d1f81773f385775186d3ac1967b6e94c96d037e5427a0f21c0fbd0c8bdb10',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
