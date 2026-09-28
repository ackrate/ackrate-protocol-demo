#!/bin/sh
set -eu
archive='ackrate-build-notary.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/build-notary.zip'
node -e "const f='ackrate-build-notary.zip',e='03ae354c21d58464e843501fa2765d65ba8a825d544c8b777ecd6e61a3368124',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
