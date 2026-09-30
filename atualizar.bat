@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ======================================================================
echo   ATUALIZACAO AUTOMATICA - ASPHERIC ANALYTICS (WINDOWS SERVER)
echo ======================================================================
echo.

REM 1. Verifica se o Git esta disponivel ou localiza nos caminhos padroes
where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    if exist "C:\Program Files\Git\cmd\git.exe" set "PATH=%PATH%;C:\Program Files\Git\cmd;C:\Program Files\Git\bin"
    if exist "C:\Program Files (x86)\Git\cmd\git.exe" set "PATH=%PATH%;C:\Program Files (x86)\Git\cmd;C:\Program Files (x86)\Git\bin"
    if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" set "PATH=%PATH%;%LOCALAPPDATA%\Programs\Git\cmd"
)

where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO CRITICO] O Git nao foi encontrado no sistema!
    echo.
    echo Para que a atualizacao automatica funcione, instale o Git para Windows:
    echo https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

REM 2. Verifica se o Python esta disponivel ou localiza nos caminhos padroes
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    if exist "C:\Python38\python.exe" set "PATH=%PATH%;C:\Python38;C:\Python38\Scripts"
    if exist "C:\Python39\python.exe" set "PATH=%PATH%;C:\Python39;C:\Python39\Scripts"
    if exist "C:\Python310\python.exe" set "PATH=%PATH%;C:\Python310;C:\Python310\Scripts"
    if exist "C:\Program Files\Python38\python.exe" set "PATH=%PATH%;C:\Program Files\Python38;C:\Program Files\Python38\Scripts"
    if exist "%LOCALAPPDATA%\Programs\Python\Python38\python.exe" set "PATH=%PATH%;%LOCALAPPDATA%\Programs\Python\Python38;%LOCALAPPDATA%\Programs\Python\Python38\Scripts"
    if exist "%LOCALAPPDATA%\Programs\Python\Python39\python.exe" set "PATH=%PATH%;%LOCALAPPDATA%\Programs\Python\Python39;%LOCALAPPDATA%\Programs\Python\Python39\Scripts"
    if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" set "PATH=%PATH%;%LOCALAPPDATA%\Programs\Python\Python310;%LOCALAPPDATA%\Programs\Python\Python310\Scripts"
)

where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO CRITICO] Python nao foi encontrado neste servidor!
    echo.
    echo Por favor, instale o Python 3.8+ marcando a opcao "Add python.exe to PATH".
    echo https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo [+] Localizacao das ferramentas:
where git
where python
echo.

REM 3. Configuracao do Git e download da versao mais recente
echo [+] Sincronizando com o repositorio GitHub...
if not exist ".git" (
    echo [+] Inicializando controle de versao Git...
    git init
    git remote add origin https://github.com/edsonllOliveira/Analises.git
) else (
    git remote set-url origin https://github.com/edsonllOliveira/Analises.git
)

echo [+] Baixando alteracoes mais recentes (git fetch)...
git fetch --all --prune
if %ERRORLEVEL% NEQ 0 (
    echo [!] Tentando conexao direta com o branch main...
    git fetch origin main
)

echo [+] Aplicando atualizacao forcada da branch main (git reset --hard)...
git branch -M main
git reset --hard origin/main
git branch --set-upstream-to=origin/main main

echo.
echo [+] Versao do commit baixado:
git log -1 --oneline
echo.

REM 4. Instalacao/Verificacao de dependencias Python
echo [+] Verificando pacotes e bibliotecas Python...
python -m pip install --upgrade pip >nul 2>&1
python -m pip install fastapi uvicorn fdb pydantic

REM 5. Encerramento seguro do servidor anterior na porta 8011
echo.
echo [+] Encerrando instancia anterior em execucao...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :8011 ^| findstr LISTENING') do (
    echo     Finalizando processo ocupando a porta 8011 (PID: %%p)...
    taskkill /F /PID %%p >nul 2>&1
)
powershell -Command "Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*run_server.py*' } | Stop-Process -Force" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq *run_server.py*" >nul 2>&1

echo [+] Aguardando liberacao da porta 8011...
timeout /t 3 /nobreak >nul

REM 6. Inicializacao do servidor
echo [+] Iniciando a nova versao da aplicacao...
if exist "iniciar.bat" (
    start "Aspheric Analytics Server" cmd /k "iniciar.bat"
) else (
    start "Aspheric Analytics Server" python run_server.py
)

echo.
echo ======================================================================
echo   [SUCESSO] Aplicacao atualizada e reiniciada com exito!
echo   Acesse no navegador: http://localhost:8011
echo ======================================================================
echo.
timeout /t 8
