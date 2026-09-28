#!/bin/sh
set -eu
archive='ackrate-api-tollgate.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/api-tollgate.zip'
node -e "const f='ackrate-api-tollgate.zip',e='a33b2a223dfb61af741aad0c6cfd1c31c21666f591bb87b7a01c4e17f258af40',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
