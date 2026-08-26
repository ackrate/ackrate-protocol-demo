#!/bin/sh
set -eu
archive='ackrate-data-owner-gateway.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/data-owner-gateway.zip'
node -e "const f='ackrate-data-owner-gateway.zip',e='2024f45c93775a699ff89adb77e8623800acc91720411671e3f96593930faabc',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
