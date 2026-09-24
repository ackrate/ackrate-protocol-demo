#!/bin/sh
set -eu
archive='ackrate-human-review-outbox.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/human-review-outbox.zip'
node -e "const f='ackrate-human-review-outbox.zip',e='86ab102b3ca67816c5bd443063581ed905a8b0f774bf33ce03f6d5f4ea75cd84',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
