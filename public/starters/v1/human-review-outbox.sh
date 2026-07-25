#!/bin/sh
set -eu
archive='reapp-human-review-outbox.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/human-review-outbox.zip'
node -e "const f='reapp-human-review-outbox.zip',e='4916715620a257dc44f7264bb16f58d79b30c76607a0adc7a65fb6466b528fde',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nREAPP starter installed. Run: npm run demo\n'
