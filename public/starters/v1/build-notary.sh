#!/bin/sh
set -eu
archive='reapp-build-notary.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/build-notary.zip'
node -e "const f='reapp-build-notary.zip',e='b1b202f94c7d4c947b342386e0b8ad928f50967bd9eff73229067ffbd2332465',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nREAPP starter installed. Run: npm run demo\n'
