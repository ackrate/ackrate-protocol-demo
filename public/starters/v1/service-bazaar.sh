#!/bin/sh
set -eu
archive='ackrate-service-bazaar.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/service-bazaar.zip'
node -e "const f='ackrate-service-bazaar.zip',e='e089d0e7379d10a0ef58aa9903b617cac10d30cf10e77bfe5c003d1aac7f8298',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
