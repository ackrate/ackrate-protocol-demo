#!/bin/sh
set -eu
archive='ackrate-build-notary.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/build-notary.zip'
node -e "const f='ackrate-build-notary.zip',e='92f35e920cb378c59c3272128c531b487981a5e3ecfa36449c9edc6aa2963b29',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
