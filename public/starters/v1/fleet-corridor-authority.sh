#!/bin/sh
set -eu
archive='ackrate-fleet-corridor-authority.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.live/starters/v1/fleet-corridor-authority.zip'
node -e "const f='ackrate-fleet-corridor-authority.zip',e='5b23bcf594d98452644911908fea29c49eab7f8ce5fd234246cea51eb6d606d0',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
