#!/bin/sh
set -eu
archive='ackrate-api-tollgate.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/api-tollgate.zip'
node -e "const f='ackrate-api-tollgate.zip',e='18553123d06167231f444a760988da1d7b72c7f349c264119a3be85508fad827',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
