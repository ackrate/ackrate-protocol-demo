#!/bin/sh
set -eu
archive='ackrate-build-notary.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/build-notary.zip'
node -e "const f='ackrate-build-notary.zip',e='612841a70d60a1f73780d99be8f2ad9f482832a8e73b32d3781da73deb58f4cf',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
