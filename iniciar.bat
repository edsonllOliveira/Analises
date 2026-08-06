@echo off
cd /d "%~dp0"

echo ==================================================
echo   INICIANDO ASPHERIC ANALYTICS - SERVIDOR
echo ==================================================
echo.

where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Python nao foi encontrado no sistema!
    echo Instale o Python 3.8.10 (64-bit) marcando "Add Python 3.8 to PATH".
    echo.
    pause
    exit /b 1
)

echo [+] Executando servidor web...
python run_server.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] O servidor foi encerrado com erro.
    echo.
    pause
)
