#!/bin/bash

npm install  -g @ionic/cli
cd vendor/github.com/eaabak/ionTok 
npm install

NODE_OPTIONS=--openssl-legacy-provider /usr/local/Cellar/node/22.1.0/lib/node_modules/@ionic/cli/bin/ionic build
