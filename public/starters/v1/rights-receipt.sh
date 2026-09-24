#!/bin/sh
set -eu
archive='ackrate-rights-receipt.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/rights-receipt.zip'
node -e "const f='ackrate-rights-receipt.zip',e='0092b6063999ea4c80bf19f85b42ebc9701960c65d47b3340949c04203ad113c',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
