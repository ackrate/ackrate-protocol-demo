#!/bin/sh
set -eu
archive='ackrate-carbon-aware-run-window.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/carbon-aware-run-window.zip'
node -e "const f='ackrate-carbon-aware-run-window.zip',e='d836debcff757ea74d97245764d8f5c7682512cd039e0766993a9167c3ae816e',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
