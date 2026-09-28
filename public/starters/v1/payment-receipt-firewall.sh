#!/bin/sh
set -eu
archive='ackrate-payment-receipt-firewall.zip'
cleanup() { rm -f "$archive"; }
trap cleanup EXIT HUP INT TERM
curl -fsSLo "$archive" 'https://reapp.ackrate.com/starters/v1/payment-receipt-firewall.zip'
node -e "const f='ackrate-payment-receipt-firewall.zip',e='2ef47d123deb4a972b307bfde4172d1074322cfd30d1385e208df2d6fcac406f',s=require('node:fs'),a=require('node:crypto').createHash('sha256').update(s.readFileSync(f)).digest('hex');if(a!==e){s.rmSync(f);throw Error('Starter integrity check failed')}"
unzip -q "$archive"
rm -f "$archive"
npm ci
printf '\nACKRATE starter installed. Run: npm run demo\n'
