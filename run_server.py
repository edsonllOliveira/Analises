import sys
import socket
import urllib.request
import json
import webbrowser
import threading
import time
import uvicorn
from app import app, get_db_config

DEFAULT_PORT = 8011

def is_our_server_running(port=DEFAULT_PORT):
    try:
        url = f"http://127.0.0.1:{port}/api/status"
        req = urllib.request.urlopen(url, timeout=1)
        data = json.loads(req.read().decode('utf-8'))
        return data.get("status") == "connected"
    except Exception:
        return False

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def find_available_port(start_port=DEFAULT_PORT, max_attempts=20):
    for port in range(start_port, start_port + max_attempts):
        if not is_port_in_use(port):
            return port
    return start_port

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"

def main():
    print("=" * 70)
    print("  ASPHERIC ANALYTICS - GESTÃO FISCAL, ORDENS DE SERVIÇO & ANÁLISES")
    print("=" * 70)
    
    try:
        server, database, ini_path = get_db_config()
        print(f"[+] Configuração do Banco Firebird ({ini_path}):")
        print(f"    - Servidor : {server}")
        print(f"    - Banco    : {database}")
    except Exception as e:
        print(f"[!] AVISO ao ler db.ini: {e}")

    # 1. Check if our server is already active on port 8011
    if is_our_server_running(DEFAULT_PORT):
        url = f"http://localhost:{DEFAULT_PORT}"
        local_ip = get_local_ip()
        print(f"\n[+] O servidor já está ativo e rodando:")
        print(f"    - Acesso Local   : {url}")
        print(f"    - Acesso na Rede : http://{local_ip}:{DEFAULT_PORT}")
        print("[+] Abrindo a aplicação no seu navegador...")
        webbrowser.open(url)
        return

    # 2. If port 8011 is occupied by something else, find an available port
    port = find_available_port(DEFAULT_PORT)
    url = f"http://localhost:{port}"
    local_ip = get_local_ip()

    print(f"\n[+] Iniciando servidor web na porta {port} com suporte a Acesso de Rede:")
    print(f"    👉 Acesso nesta máquina : http://localhost:{port}")
    print(f"    🌐 Acesso por outros computadores da Rede : http://{local_ip}:{port}")
    print("\n[+] Pressione Ctrl+C para encerrar o servidor.\n")
    
    def open_browser():
        time.sleep(1.0)
        webbrowser.open(url)
        
    threading.Thread(target=open_browser, daemon=True).start()
    
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)

if __name__ == "__main__":
    main()
