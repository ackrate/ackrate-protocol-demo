#!/bin/sh
set -eu
archive='ackrate-cold-chain-passport.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/cold-chain-passport.zip'
node -e "const f='ackrate-cold-chain-passport.zip',e='00bab4392acad272a6cc727be0bce3eacd4ce56d5429ca5658a1fc9e8f73460c',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
