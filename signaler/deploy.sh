#!/bin/bash

if [ ! -d "./pwnd" ]; then
	git checkout https://github.com/appellation/pwnd.git
	cd pwnd
else
	cd pwnd
	git fetch origin
	git reset --hard origin/master
fi

mv -f ./keys ./pwnd/signaler/keys

cd signaler
docker-compose build
docker-compose up -d
