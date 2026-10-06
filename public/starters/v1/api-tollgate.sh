#!/bin/sh
set -eu
archive='ackrate-api-tollgate.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/api-tollgate.zip'
node -e "const f='ackrate-api-tollgate.zip',e='531ddd6ed2a6ad7532dc05008ee3e781da868b99bf69954b7f803bdd110bdc54',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
