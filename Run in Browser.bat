@echo off
cd /d "%~dp0"
start "" http://localhost:8173
node server.js
