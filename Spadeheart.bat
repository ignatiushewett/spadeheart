@echo off
rem Spadeheart in its own window, no browser. The first run fetches the window it runs in (Electron, once; needs Node.js installed).
cd /d "%~dp0desktop"
if not exist node_modules\electron\dist\electron.exe (
  echo First run: getting the game window ready. This happens once.
  call npm install --no-audit --no-fund
  rem Newer versions of Node can stop Electron's own unpacking part way: unpack the download it fetched with Windows' tar instead.
  if not exist node_modules\electron\dist\electron.exe (
    for /r "%LOCALAPPDATA%\electron\Cache" %%f in (electron-v*-win32-x64.zip) do (
      if not exist node_modules\electron\dist\electron.exe (
        rmdir /s /q node_modules\electron\dist 2>nul
        mkdir node_modules\electron\dist
        "%SystemRoot%\System32\tar.exe" -xf "%%f" -C node_modules\electron\dist
        <nul set /p ="electron.exe" > node_modules\electron\path.txt
      )
    )
  )
)
if not exist node_modules\electron\dist\electron.exe (
  echo Could not get the game window ready. Is Node.js installed? You can still play with start.bat, in the browser.
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" .
