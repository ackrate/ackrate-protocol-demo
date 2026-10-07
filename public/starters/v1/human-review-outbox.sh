#!/bin/sh
set -eu
archive='ackrate-human-review-outbox.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/human-review-outbox.zip'
node -e "const f='ackrate-human-review-outbox.zip',e='ed963933c1c60e219d14b120c9fd032a04fae43e1a59dd95ec95522651ccb28a',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
