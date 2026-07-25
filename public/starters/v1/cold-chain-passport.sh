#!/bin/sh
set -eu
archive='reapp-cold-chain-passport.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/cold-chain-passport.zip'
node -e "const f='reapp-cold-chain-passport.zip',e='1556db2ab6786838e0921c3bcbf259ccb96953f62043b7647c9c16aa99b0ab6a',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nREAPP starter installed. Run: npm run demo\n'
