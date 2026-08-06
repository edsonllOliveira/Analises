Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Obtém a pasta onde este arquivo VBS está localizado
strPath = fso.GetParentFolderName(WScript.ScriptFullName)

' Define o diretório de trabalho para a pasta do projeto
WshShell.CurrentDirectory = strPath

' Executa a aplicação em segundo plano (0 = oculto, False = não bloqueia a execução)
WshShell.Run "python run_server.py", 0, False
