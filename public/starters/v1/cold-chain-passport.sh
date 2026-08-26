#!/bin/sh
set -eu
archive='ackrate-cold-chain-passport.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/cold-chain-passport.zip'
node -e "const f='ackrate-cold-chain-passport.zip',e='952e904a4457755150a60ba85cfd5aaf0125fe5413288f241bbe3e06971abfe1',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
