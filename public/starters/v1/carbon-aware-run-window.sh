#!/bin/sh
set -eu
archive='ackrate-carbon-aware-run-window.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/carbon-aware-run-window.zip'
node -e "const f='ackrate-carbon-aware-run-window.zip',e='62f91e9d4f1ed4232a8f79e134dc9f6c38a498f19dd494ea7c4733ed9f47b237',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
