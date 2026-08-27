#!/bin/sh
set -eu
archive='ackrate-api-tollgate.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/api-tollgate.zip'
node -e "const f='ackrate-api-tollgate.zip',e='3932af593d8b01d9a15c44ad2737502260c19866fbaa38707446be265ffaec68',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
