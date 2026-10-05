#!/bin/sh
set -eu
archive='ackrate-research-source-scout.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/research-source-scout.zip'
node -e "const f='ackrate-research-source-scout.zip',e='90d9f07224d3dd4d9b7ca5efdd2e70b9e9497b2fbe30dadbf3cdc7e292621163',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
