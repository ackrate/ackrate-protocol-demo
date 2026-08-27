#!/bin/sh
set -eu
archive='ackrate-page-snapshot-meter.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/page-snapshot-meter.zip'
node -e "const f='ackrate-page-snapshot-meter.zip',e='1c6eaf397e7d330b7328f11610d5432af0175f3f97a458beddbbdc7ef9625f42',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
