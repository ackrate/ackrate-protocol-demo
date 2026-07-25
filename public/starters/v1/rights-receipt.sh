#!/bin/sh
set -eu
archive='reapp-rights-receipt.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/rights-receipt.zip'
node -e "const f='reapp-rights-receipt.zip',e='64dee88cfc0d379c07383258f3a82103dcabc1c41c14b6abb07bfe554cd0d74b',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nREAPP starter installed. Run: npm run demo\n'
