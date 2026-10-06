#!/bin/sh
set -eu
archive='ackrate-rights-receipt.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/rights-receipt.zip'
node -e "const f='ackrate-rights-receipt.zip',e='38605973226a34c6cafdb1b185f8f09e9bf9ba3eef5fb0117574794b273cefbc',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
