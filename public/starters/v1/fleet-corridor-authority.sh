#!/bin/sh
set -eu
archive='ackrate-fleet-corridor-authority.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://staging.ackrate.com/starters/v1/fleet-corridor-authority.zip'
node -e "const f='ackrate-fleet-corridor-authority.zip',e='3170d6c768673a2efa479a9f6673475a63639e6e9bd9e87419c1bd4ce4ff8b27',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
