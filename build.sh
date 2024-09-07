#!/bin/bash

npm install  -g @ionic/cli
npm install @capacitor/haptics

cd vendor/github.com/eaabak/ionTok 
npm install

ionic build
