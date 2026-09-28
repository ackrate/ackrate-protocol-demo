#!/bin/sh
set -eu
archive='ackrate-human-review-outbox.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/human-review-outbox.zip'
node -e "const f='ackrate-human-review-outbox.zip',e='183fbba7b62a716bf9fa54d0d022bb2e41543054cef61b2180db89e15519c8d3',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
