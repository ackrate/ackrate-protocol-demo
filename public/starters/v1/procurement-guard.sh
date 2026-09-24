#!/bin/sh
set -eu
archive='ackrate-procurement-guard.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/procurement-guard.zip'
node -e "const f='ackrate-procurement-guard.zip',e='9ad78b89e8f87b78530aef640cb97d18d2fb64c044c9d85c451f6aba7504e0a9',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
