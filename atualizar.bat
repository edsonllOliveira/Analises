@echo off
cd /d "%~dp0"

echo ==================================================
echo   INSTALACAO E ATUALIZACAO AUTOMATICA - ASPHERIC ANALYTICS
echo ==================================================
echo.

REM 0. Verifica se o Python esta instalado e no PATH
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO CRITICO] Python nao foi encontrado neste servidor!
    echo.
    echo Por favor, instale o Python 3 (https://www.python.org/downloads/)
    echo IMPORTANTE: Durante a instalacao, marque a opcao "Add python.exe to PATH".
    echo.
    pause
    exit /b 1
)

REM 1. Se app.py nao existir na pasta, clona o repositorio
if not exist "app.py" (
    echo [+] Primeira execucao detectada. Baixando o projeto do GitHub...
    git clone https://github.com/edsonllOliveira/Analises.git .
) else (
    REM Se a pasta .git nao existir, inicializa e associa
    if not exist ".git" (
        echo [+] Configurando repositorio Git local...
        git init
        git remote add origin https://github.com/edsonllOliveira/Analises.git
    )
    echo [+] Baixando atualizacoes do GitHub...
    git pull origin main
)

REM 2. Se o pull falhar por conta de divergencias locais, forca a sincronizacao
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] Sincronizando com a versao mais recente do remoto...
    git fetch origin main
    git reset --hard origin/main
)

echo.
echo [+] Verificando dependencias Python...
python -m pip install fastapi uvicorn fdb pydantic >nul 2>&1

echo.
echo [+] Encerrando instancia ativa do servidor...
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*run_server.py*' } | Stop-Process -Force" >nul 2>&1

echo [+] Aguardando liberacao de arquivos...
timeout /t 2 /nobreak >nul

echo [+] Iniciando a aplicacao em segundo plano...
if exist "start_server_hidden.vbs" (
    start wscript "%~dp0start_server_hidden.vbs"
) else (
    start python run_server.py
)

echo.
echo ==================================================
echo   [OK] Aplicacao configurada e iniciada com sucesso!
echo   Acesse no navegador: http://localhost:8011
echo ==================================================
echo.
pause
