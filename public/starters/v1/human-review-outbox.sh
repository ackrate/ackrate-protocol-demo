#!/bin/sh
set -eu
archive='ackrate-human-review-outbox.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/human-review-outbox.zip'
node -e "const f='ackrate-human-review-outbox.zip',e='b8907da94abc29b8942d91a1db1251df37667d5b00e9cfde96fe8b177674bda1',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
