@echo off
chcp 65001 >nul
:: Garante que a execução ocorra dentro do diretório onde este arquivo .bat está localizado
cd /d "%~dp0"

echo ==================================================
echo   ATUALIZADOR AUTOMÁTICO - SISTEMA OS AJUSTES
echo ==================================================
echo.

:: Se a pasta ainda não tiver a estrutura Git inicializada no servidor, configura automaticamente
if not exist ".git" (
    echo [+] Configurando repositório Git local...
    git init
    git remote add origin https://github.com/edsonllOliveira/Analises.git
)

echo [+] Baixando atualizações de https://github.com/edsonllOliveira/Analises.git ...
git pull https://github.com/edsonllOliveira/Analises.git main

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] Ocorreu um alerta/erro ao atualizar via git pull.
    echo [!] Tentando sincronizar e alinhar com o repositório remoto...
    git fetch https://github.com/edsonllOliveira/Analises.git main
    git reset --hard FETCH_HEAD
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
