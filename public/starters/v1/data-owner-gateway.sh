#!/bin/sh
set -eu
archive='ackrate-data-owner-gateway.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/data-owner-gateway.zip'
node -e "const f='ackrate-data-owner-gateway.zip',e='f7539a95f1208e6043ba8271d139a1794dd096da796c54f9bffc6985f6fb11e9',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
