#!/bin/sh
set -eu
archive='ackrate-data-owner-gateway.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/data-owner-gateway.zip'
node -e "const f='ackrate-data-owner-gateway.zip',e='34ee43f639130f3155f3b57219eaa2fb30f1401e949d76ee18ea05139f968369',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
