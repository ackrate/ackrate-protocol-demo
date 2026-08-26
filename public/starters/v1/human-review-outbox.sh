#!/bin/sh
set -eu
archive='ackrate-human-review-outbox.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/human-review-outbox.zip'
node -e "const f='ackrate-human-review-outbox.zip',e='7b3259178a8f19038c54db9c89aac0003ec73d4f321ea700afd2ebfd00148535',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
