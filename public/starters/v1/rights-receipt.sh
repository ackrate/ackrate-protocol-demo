#!/bin/sh
set -eu
archive='ackrate-rights-receipt.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/rights-receipt.zip'
node -e "const f='ackrate-rights-receipt.zip',e='6026a2762d676e191b8ac2d9b9b26f057aa8ce7cf7f5e8bfc8f73fa96f27293b',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
