@echo off
chcp 65001 >nul
echo ==================================================
echo   ATUALIZADOR AUTOMÁTICO - SISTEMA OS AJUSTES
echo ==================================================
echo.

echo [+] Baixando as últimas atualizações do Git (origin main)...
git pull origin main

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] Ocorreu um erro ao executar git pull. Verifique a conexão ou alterações locais.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [+] Encerrando instância atual do servidor (run_server.py)...
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*run_server.py*' } | Stop-Process -Force" >nul 2>&1

echo [+] Aguardando 2 segundos para liberação de portas e arquivos...
timeout /t 2 /nobreak >nul

echo [+] Iniciando o servidor atualizado em segundo plano...
start wscript "%~dp0start_server_hidden.vbs"

echo.
echo ==================================================
echo   [OK] Aplicação atualizada e iniciada com sucesso!
echo ==================================================
echo.
timeout /t 4
