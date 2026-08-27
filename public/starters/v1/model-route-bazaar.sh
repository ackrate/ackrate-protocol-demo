#!/bin/sh
set -eu
archive='ackrate-model-route-bazaar.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/model-route-bazaar.zip'
node -e "const f='ackrate-model-route-bazaar.zip',e='93ed9d6ee7e539241025f7ffed5cbef6624ef7b76f4301d38325ff243091f706',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
