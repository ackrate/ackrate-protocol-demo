#!/bin/sh
set -eu
archive='ackrate-cold-chain-passport.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/cold-chain-passport.zip'
node -e "const f='ackrate-cold-chain-passport.zip',e='980357ee0ca28da1606dd87146bf891800c688550cd2cb27b3988f672a1b2d8e',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
