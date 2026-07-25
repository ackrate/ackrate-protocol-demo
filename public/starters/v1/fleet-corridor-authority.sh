#!/bin/sh
set -eu
archive='reapp-fleet-corridor-authority.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/fleet-corridor-authority.zip'
node -e "const f='reapp-fleet-corridor-authority.zip',e='76433930c546ecb33b2404d6de4dc7440f22e439eeecf9c0babd9096217ec311',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nREAPP starter installed. Run: npm run demo\n'
