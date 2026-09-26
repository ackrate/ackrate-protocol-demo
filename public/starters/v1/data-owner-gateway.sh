#!/bin/sh
set -eu
archive='ackrate-data-owner-gateway.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/data-owner-gateway.zip'
node -e "const f='ackrate-data-owner-gateway.zip',e='86af0e9f918ecc6947b4c4ea635b13205c815219706377d03c2f12f49e0a8935',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
