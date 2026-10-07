#!/bin/sh
set -eu
archive='ackrate-build-notary.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/build-notary.zip'
node -e "const f='ackrate-build-notary.zip',e='bc506f5fdf84b95bb432f513f94174a8d5b92ccc24b143474ea2dff1c1fb909f',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
