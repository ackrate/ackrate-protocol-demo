#!/bin/sh
set -eu
archive='ackrate-cold-chain-passport.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/cold-chain-passport.zip'
node -e "const f='ackrate-cold-chain-passport.zip',e='54e292f569e8f75b1a8cf239f5aae35be5e1bc3afc61834f98b43942ee2aa659',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
