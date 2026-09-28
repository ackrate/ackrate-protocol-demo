#!/bin/sh
set -eu
archive='ackrate-rights-receipt.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/rights-receipt.zip'
node -e "const f='ackrate-rights-receipt.zip',e='4ebc2f33b990498d41fb573b23055544ba72e85f2cc3002f577229e5065aca2b',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
