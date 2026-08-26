#!/bin/sh
set -eu
archive='ackrate-fleet-corridor-authority.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/fleet-corridor-authority.zip'
node -e "const f='ackrate-fleet-corridor-authority.zip',e='88d5dd845de8eb5ce18450937d66aab5e9cb7fe94a0a25a56daa3bfafcd25400',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
