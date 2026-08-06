@echo off
chcp 65001 >nul
:: Garante que a execução ocorra dentro do diretório onde este arquivo .bat está localizado
cd /d "%~dp0"

echo ==================================================
echo   INSTALAÇÃO E ATUALIZAÇÃO AUTOMÁTICA - ASPHERIC ANALYTICS
echo ==================================================
echo.

:: 1. Se app.py não existir na pasta, clona todo o repositório pela primeira vez
if not exist "app.py" (
    echo [+] Primeira execução detectada. Baixando todo o projeto do GitHub...
    git clone https://github.com/edsonllOliveira/Analises.git .
) else (
    :: Se a pasta .git não existir, inicializa e associa
    if not exist ".git" (
        echo [+] Configurando repositório Git local...
        git init
        git remote add origin https://github.com/edsonllOliveira/Analises.git
    )
    echo [+] Baixando atualizações do GitHub (https://github.com/edsonllOliveira/Analises.git)...
    git pull https://github.com/edsonllOliveira/Analises.git main
)

:: 2. Se o pull falhar por conta de divergências locais, força a sincronização
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] Sincronizando e alinhando com a versão mais recente do remoto...
    git fetch https://github.com/edsonllOliveira/Analises.git main
    git reset --hard FETCH_HEAD
)

echo.
echo [+] Verificando/Instalando dependências Python (FastAPI, Uvicorn, FDB, Pydantic)...
pip install fastapi uvicorn fdb pydantic

echo.
echo [+] Encerrando qualquer instância ativa do servidor (run_server.py)...
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*run_server.py*' } | Stop-Process -Force" >nul 2>&1

echo [+] Aguardando liberação de arquivos e portas...
timeout /t 2 /nobreak >nul

echo [+] Iniciando a aplicação em segundo plano (Modo Oculto)...
start wscript "%~dp0start_server_hidden.vbs"

echo.
echo ==================================================
echo   [OK] Aplicação configurada e iniciada com sucesso!
echo   🌐 Acesse no navegador: http://localhost:8011
echo ==================================================
echo.
timeout /t 5
