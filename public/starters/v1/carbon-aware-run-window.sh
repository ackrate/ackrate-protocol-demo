#!/bin/sh
set -eu
archive='ackrate-carbon-aware-run-window.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/carbon-aware-run-window.zip'
node -e "const f='ackrate-carbon-aware-run-window.zip',e='b5c7b5646be567ad5c3833919e19287d247d5347df128d1751c95424bd2ac644',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
