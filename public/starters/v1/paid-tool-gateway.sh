#!/bin/sh
set -eu
archive='ackrate-paid-tool-gateway.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/paid-tool-gateway.zip'
node -e "const f='ackrate-paid-tool-gateway.zip',e='de561303df0cf586d6720bdad5d8a4abe2ed31614133ad52d60277b140061993',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
