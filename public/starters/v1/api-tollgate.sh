#!/bin/sh
set -eu
archive='ackrate-api-tollgate.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/api-tollgate.zip'
node -e "const f='ackrate-api-tollgate.zip',e='222a3e53a32408b28918932ca93741879df67ab18769aa51c04f65df6687ad2a',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
