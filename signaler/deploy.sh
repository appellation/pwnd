#!/bin/bash

if [ ! -d "./pwnd" ]; then
	git clone https://github.com/appellation/pwnd.git
	cd pwnd
else
	cd pwnd
	git fetch origin
	git reset --hard origin/master
fi

mv -f ../keys ./signaler/keys

cd signaler
docker-compose build
docker-compose up -d
