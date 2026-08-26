#!/bin/sh
set -eu
archive='ackrate-paid-tool-gateway.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/paid-tool-gateway.zip'
node -e "const f='ackrate-paid-tool-gateway.zip',e='fe2b2f31408a3ff33483894188a38d25a49a64fac2206d531dfeeeba6d252a74',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
