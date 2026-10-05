#!/bin/sh
set -eu
archive='ackrate-cold-chain-passport.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/cold-chain-passport.zip'
node -e "const f='ackrate-cold-chain-passport.zip',e='cbb24b696b703f66a933ff38f2473fda197b4e64525607f59d7e0f3f84b09eeb',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
