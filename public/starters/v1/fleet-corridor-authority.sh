#!/bin/sh
set -eu
archive='ackrate-fleet-corridor-authority.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/fleet-corridor-authority.zip'
node -e "const f='ackrate-fleet-corridor-authority.zip',e='1538d75c413d0ab21704b215a136c03b0a33339d2f25cb967ad006086640c0ea',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
