#!/bin/sh
set -eu
archive='ackrate-data-owner-gateway.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/data-owner-gateway.zip'
node -e "const f='ackrate-data-owner-gateway.zip',e='f1cc45c63c26177e8f1c81b1f2a38eb18799c4e895af814f07f9293464037704',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
