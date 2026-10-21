@echo off
cd /d "%~dp0"

echo ==================================================
echo   INICIANDO ASPHERIC ANALYTICS - SERVIDOR
echo ==================================================
echo.

where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Python nao foi encontrado no sistema!
    echo Certifique-se de que o Python esta instalado e adicionado ao PATH do Windows.
    echo.
    pause
    exit /b 1
)

echo [+] Iniciando aplicacao e abrindo navegador...
python run_server.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] O servidor foi encerrado com erro.
    echo.
    pause
)
