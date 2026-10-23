import os
import datetime
import calendar
import re
import configparser
import logging
from typing import List, Optional
from decimal import Decimal
import fdb
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import unicodedata
from difflib import SequenceMatcher

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aspheric_analytics")

def sanitize_date_param(val: Optional[str]) -> Optional[str]:
    """
    Normaliza e sanitiza valores de data para formato padrão Firebird (YYYY-MM-DD).
    Aceita formatos YYYY-MM-DD, DD/MM/YYYY, etc.
    Corrige dias fora do limite do mês (ex: 31/09/2026 -> 2026-09-30, 29/02/2026 -> 2026-02-28).
    """
    if not val or hasattr(val, 'default'):
        return None
    s = str(val).strip()
    if not s:
        return None
    
    # 1. Verifica formato YYYY-MM-DD ou YYYY/MM/DD
    m_iso = re.match(r'^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})', s)
    if m_iso:
        y, m, d = int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3))
    else:
        # 2. Verifica formato DD/MM/YYYY ou DD-MM-YYYY
        m_br = re.match(r'^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})', s)
        if m_br:
            d, m, y = int(m_br.group(1)), int(m_br.group(2)), int(m_br.group(3))
        else:
            return s
            
    if 1 <= m <= 12 and 1900 <= y <= 2100:
        # Corrige erro comum de digitação de ano no date picker (ex: 2006 -> 2026, 2005 -> 2025)
        if 2000 <= y <= 2009:
            y = 2020 + (y % 10)
        max_d = calendar.monthrange(y, m)[1]
        clamped_d = min(max(1, d), max_d)
        return f"{y:04d}-{m:02d}-{clamped_d:02d}"
    return s

def get_teste_ini_path():
    if os.path.exists(r"c:\DataWebTeste\Dilab\Db.ini"):
        return r"c:\DataWebTeste\Dilab\Db.ini"
    if os.path.exists(r"c:\DataWenTeste\Dilab\Db.ini"):
        return r"c:\DataWenTeste\Dilab\Db.ini"
    return r"c:\dataweb\Dilab\db.ini"

def get_preset_dbs():
    return {
        "producao": {
            "key": "producao",
            "name": r"Produção (c:\dataweb\Dilab\db.ini)",
            "ini_path": r"c:\dataweb\Dilab\db.ini"
        }
    }

ACTIVE_DB_KEY = "producao"
CUSTOM_INI_PATH = None

def get_active_ini_path():
    global ACTIVE_DB_KEY, CUSTOM_INI_PATH
    presets = get_preset_dbs()
    if ACTIVE_DB_KEY == "custom" and CUSTOM_INI_PATH:
        return CUSTOM_INI_PATH
    if ACTIVE_DB_KEY in presets:
        return presets[ACTIVE_DB_KEY]["ini_path"]
    return r"c:\dataweb\Dilab\db.ini"

def get_db_config(ini_path=None):
    path_to_use = ini_path or get_active_ini_path()
    if not os.path.exists(path_to_use):
        raise RuntimeError(f"Arquivo db.ini não encontrado em '{path_to_use}'")
    
    # Se o caminho informado for diretamente o arquivo do banco Firebird (.DATAWEB / .FDB)
    if path_to_use.lower().endswith(('.fdb', '.dataweb')):
        return "SRVDW", path_to_use, path_to_use

    config = configparser.ConfigParser()
    config.read(path_to_use)
    server = config.get("Main", "DbServerName", fallback="SRVDW")
    database = config.get("Main", "DbDatabaseName", fallback="")
    return server, database, path_to_use

def get_db_connection(ini_path=None):
    server, database, _ = get_db_config(ini_path)
    return fdb.connect(
        host=server,
        database=database,
        user="SYSDBA",
        password="masterkey",
        charset="WIN1252"
    )

app = FastAPI(title="Aspheric Analytics", version="1.3.0", description="Plataforma Aspheric Analytics - Gestão Fiscal, Ordens de Serviço & Análises")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class ItemUpdateModel(BaseModel):
    cod_transacaoitem: int
    cod_item: str
    descricao: Optional[str] = ""
    quantidade: float
    valorunitario: float
    total: float
    valordesconto: Optional[float] = 0.0
    cod_naturezaoperacao: Optional[str] = None
    aliquotaicms: Optional[float] = 0.0
    aliquotaicmsdiferimento: Optional[float] = 0.0
    basecalculoicms: Optional[float] = 0.0
    totalicms: Optional[float] = 0.0
    tributacaoicms: Optional[str] = "00"
    totalissqn: Optional[float] = 0.0
    aliquotaissqn: Optional[float] = 0.0
    totalipi: Optional[float] = 0.0
    aliquotapi: Optional[float] = 0.0
    totalpis: Optional[float] = 0.0
    aliquotapis: Optional[float] = 0.0
    totalcofins: Optional[float] = 0.0
    aliquotacofins: Optional[float] = 0.0
    totalicmssubstituicao: Optional[float] = 0.0

class OSUpdateModel(BaseModel):
    cod_ordemservico: int
    cod_empresa: int
    cod_naturezaoperacao: Optional[str] = None
    total_icms: float
    total_issqn: Optional[float] = 0.0
    total_ipi: Optional[float] = 0.0
    total_pis: Optional[float] = 0.0
    total_cofins: Optional[float] = 0.0
    total_icms_st: Optional[float] = 0.0
    total: float
    valordesconto: Optional[float] = 0.0
    items: List[ItemUpdateModel]

class SelectDBModel(BaseModel):
    db_key: str
    custom_path: Optional[str] = None

@app.get("/api/databases")
def get_databases():
    presets = get_preset_dbs()
    result = []
    for key, db_info in presets.items():
        exists = os.path.exists(db_info["ini_path"])
        result.append({
            "key": key,
            "name": db_info["name"],
            "ini_path": db_info["ini_path"],
            "exists": exists,
            "active": (ACTIVE_DB_KEY == key)
        })
    if CUSTOM_INI_PATH:
        result.append({
            "key": "custom",
            "name": f"Customizado ({CUSTOM_INI_PATH})",
            "ini_path": CUSTOM_INI_PATH,
            "exists": os.path.exists(CUSTOM_INI_PATH),
            "active": (ACTIVE_DB_KEY == "custom")
        })
    return {
        "active_key": ACTIVE_DB_KEY,
        "active_path": get_active_ini_path(),
        "databases": result
    }

@app.post("/api/databases/select")
def select_database(data: SelectDBModel):
    global ACTIVE_DB_KEY, CUSTOM_INI_PATH
    
    presets = get_preset_dbs()
    target_key = data.db_key
    target_path = None
    
    if target_key == "custom":
        if not data.custom_path or not data.custom_path.strip():
            raise HTTPException(status_code=400, detail="Caminho do arquivo .ini customizado é obrigatório.")
        target_path = data.custom_path.strip()
    elif target_key in presets:
        target_path = presets[target_key]["ini_path"]
    else:
        raise HTTPException(status_code=400, detail=f"Ambiente de banco de dados '{target_key}' é inválido.")
        
    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail=f"O arquivo de configuração db.ini não existe no caminho: '{target_path}'")
        
    try:
        server, database, used_path = get_db_config(target_path)
        conn = fdb.connect(host=server, database=database, user="SYSDBA", password="masterkey", charset="WIN1252")
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM ORDEMSERVICO")
        count = cur.fetchone()[0]
        conn.close()
        
        ACTIVE_DB_KEY = target_key
        if target_key == "custom":
            CUSTOM_INI_PATH = target_path
            
        logger.info(f"Banco de dados alterado para '{ACTIVE_DB_KEY}' ({used_path}) -> {server}:{database}")
        return {
            "status": "success",
            "message": f"Banco de dados alterado para: {database}",
            "active_key": ACTIVE_DB_KEY,
            "server": server,
            "database": database,
            "total_os": count,
            "ini_path": used_path
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao conectar no banco '{target_path}': {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao conectar no Firebird ({target_path}): {str(e)}")

@app.get("/api/status")
def get_status():
    try:
        server, database, ini_path = get_db_config()
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM ORDEMSERVICO")
        count = cur.fetchone()[0]
        conn.close()
        return {
            "status": "connected",
            "active_key": ACTIVE_DB_KEY,
            "ini_path": ini_path,
            "server": server,
            "database": database,
            "total_os": count
        }
    except Exception as e:
        logger.error(f"Erro ao testar conexão: {e}")
        return {
            "status": "error",
            "active_key": ACTIVE_DB_KEY,
            "ini_path": get_active_ini_path(),
            "error": str(e)
        }

@app.get("/api/naturezas")
def get_naturezas():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT COD_NATUREZAOPERACAO, DESCRICAO 
            FROM NATUREZAOPERACAO 
            WHERE ATIVO = 'T' OR ATIVO = 'S' OR ATIVO IS NULL OR ATIVO = '1'
            ORDER BY COD_NATUREZAOPERACAO
        """)
        rows = cur.fetchall()
        conn.close()
        return [
            {"cod": r[0].strip() if r[0] else "", "descricao": r[1].strip() if r[1] else ""}
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Erro ao buscar naturezas de operação: {e}")
        return []

@app.get("/api/clientes/autocomplete")
def autocomplete_clientes(
    q: str = Query(..., min_length=1, description="Termo para busca de cliente"),
    limit: int = Query(15, ge=1, le=50)
):
    try:
        q_clean = str(q).strip() if q else ""
        if not q_clean or len(q_clean) < 1:
            return []
            
        conn = get_db_connection()
        cur = conn.cursor()
        
        limit_val = int(limit) if isinstance(limit, (int, float, str)) else 15
        
        sql = f"""
            SELECT FIRST {limit_val}
                p.COD_PESSOA,
                CAST(p.NOME AS VARCHAR(250)),
                CAST(p.RAZAOSOCIAL AS VARCHAR(250)),
                p.CNPJ,
                p.CPF,
                p.IDENTIFICADOR
            FROM PESSOA p
        """
        
        where_clauses = ["(p.ATIVO = 'T' OR p.ATIVO = 'S' OR p.ATIVO IS NULL OR p.ATIVO = '1')"]
        params = []
        
        if q_clean.isdigit():
            where_clauses.append("(UPPER(p.NOME) LIKE UPPER(?) OR UPPER(p.RAZAOSOCIAL) LIKE UPPER(?) OR p.COD_PESSOA = ? OR p.IDENTIFICADOR = ? OR p.CNPJ LIKE ? OR p.CPF LIKE ?)")
            param_str = f"%{q_clean}%"
            params.extend([param_str, param_str, int(q_clean), int(q_clean), param_str, param_str])
        else:
            where_clauses.append("(UPPER(p.NOME) LIKE UPPER(?) OR UPPER(p.RAZAOSOCIAL) LIKE UPPER(?) OR p.CNPJ LIKE ? OR p.CPF LIKE ?)")
            param_str = f"%{q_clean}%"
            params.extend([param_str, param_str, param_str, param_str])
            
        sql += " WHERE " + " AND ".join(where_clauses)
        sql += " ORDER BY COALESCE(NULLIF(TRIM(p.NOME), ''), p.RAZAOSOCIAL)"
        
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        conn.close()
        
        result = []
        for r in rows:
            cod = r[0]
            nome = r[1].strip() if r[1] else ""
            razao = r[2].strip() if r[2] else ""
            cnpj = r[3].strip() if r[3] else ""
            cpf = r[4].strip() if r[4] else ""
            identificador = r[5] if (len(r) > 5 and r[5] is not None) else cod
            
            display_name = nome if nome else (razao if razao else f"Cliente {cod}")
            doc = cnpj if cnpj else (cpf if cpf else "")
            
            result.append({
                "cod_pessoa": cod,
                "identificador": identificador,
                "nome": nome,
                "razaosocial": razao,
                "display_name": display_name,
                "doc": doc,
                "label": f"Cód: {identificador} (ID: #{cod}) - {display_name}" + (f" ({doc})" if doc else "")
            })
            
        return result
    except Exception as e:
        logger.error(f"Erro ao buscar autocompletar clientes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/os")
def list_os(
    search: Optional[str] = Query(None, description="Número da OS ou código"),
    cliente: Optional[str] = Query(None, description="Filtro por nome, razão social ou documento do cliente"),
    data_inicio: Optional[str] = Query(None, description="Data inicial YYYY-MM-DD"),
    data_fim: Optional[str] = Query(None, description="Data final YYYY-MM-DD"),
    tipo_os: Optional[str] = Query("todas", description="Filtro 'todas', 'garantia' ou 'normal'"),
    limit: int = Query(30, ge=0, le=5000)
):
    try:
        limit_val = int(limit) if limit is not None and not hasattr(limit, 'default') else 30
        first_clause = f"FIRST {limit_val}" if limit_val > 0 else ""
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        sql = f"""
            SELECT {first_clause} 
                os.COD_ORDEMSERVICO, os.COD_EMPRESA, os.NUMEROORDEMSERVICO,
                t.COD_PESSOA, CAST(p.NOME AS VARCHAR(250)), CAST(p.RAZAOSOCIAL AS VARCHAR(250)),
                t.COD_NATUREZAOPERACAO, CAST(nat.DESCRICAO AS VARCHAR(250)) AS NATUREZA_DESCRICAO,
                t.TOTAL, t.TOTALPRODUTOS, t.TOTALSERVICOS,
                COALESCE((
                    SELECT SUM(
                        CASE 
                            WHEN ti.CST IN ('51', '051', '151', '251') AND ti.BASECALCULOICMS > 0 AND ti.ALIQUOTAICMS > 0 THEN
                                ti.BASECALCULOICMS * (
                                    CASE 
                                        WHEN COALESCE(ti.ALIQUOTAICMSDIFERIMENTO, 0) > 0 THEN
                                            ti.ALIQUOTAICMS * (1.0 - ti.ALIQUOTAICMSDIFERIMENTO / 100.0)
                                        WHEN ti.ALIQUOTAICMS > 12.0 THEN
                                            12.0
                                        ELSE
                                            ti.ALIQUOTAICMS
                                    END / 100.0
                                )
                            ELSE
                                COALESCE(ti.TOTALICMS, 0)
                        END
                    )
                    FROM TRANSACAO_ITEM ti
                    WHERE ti.COD_TRANSACAO = os.COD_ORDEMSERVICO AND ti.COD_EMPRESA = os.COD_EMPRESA
                ), t.TOTALICMS, 0) AS TOTALICMS,
                s.VALORDESCONTO, t.DATAEMISSAO, p.IDENTIFICADOR,
                CASE 
                    WHEN t.OBSERVACAO CONTAINING 'GARANTIA' THEN 1 
                    ELSE 0 
                END AS IS_GARANTIA,
                t.OBSERVACAO
            FROM ORDEMSERVICO os
            JOIN SAIDA s ON s.COD_SAIDA = os.COD_ORDEMSERVICO AND s.COD_EMPRESA = os.COD_EMPRESA
            JOIN TRANSACAO t ON t.COD_TRANSACAO = s.COD_SAIDA AND t.COD_EMPRESA = os.COD_EMPRESA
            LEFT JOIN PESSOA p ON p.COD_PESSOA = t.COD_PESSOA
            LEFT JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = t.COD_NATUREZAOPERACAO
        """
        
        params = []
        where_clauses = []

        if search is not None and isinstance(search, str) and search.strip():
            search_clean = search.strip()
            if search_clean.isdigit():
                where_clauses.append("(os.NUMEROORDEMSERVICO = ? OR os.COD_ORDEMSERVICO = ?)")
                params.extend([int(search_clean), int(search_clean)])
            else:
                where_clauses.append("(UPPER(p.NOME) LIKE UPPER(?) OR UPPER(p.RAZAOSOCIAL) LIKE UPPER(?))")
                s_param = f"%{search_clean}%"
                params.extend([s_param, s_param])

        if cliente is not None and isinstance(cliente, str) and cliente.strip():
            client_clean = cliente.strip()
            if client_clean.isdigit():
                where_clauses.append("(UPPER(p.NOME) LIKE UPPER(?) OR UPPER(p.RAZAOSOCIAL) LIKE UPPER(?) OR p.COD_PESSOA = ? OR p.IDENTIFICADOR = ?)")
                c_param = f"%{client_clean}%"
                params.extend([c_param, c_param, int(client_clean), int(client_clean)])
            else:
                where_clauses.append("(UPPER(p.NOME) LIKE UPPER(?) OR UPPER(p.RAZAOSOCIAL) LIKE UPPER(?))")
                c_param = f"%{client_clean}%"
                params.extend([c_param, c_param])

        dt_ini = sanitize_date_param(data_inicio)
        dt_fim = sanitize_date_param(data_fim)

        if dt_ini:
            where_clauses.append("t.DATAEMISSAO >= ?")
            params.append(dt_ini)

        if dt_fim:
            where_clauses.append("t.DATAEMISSAO <= ?")
            params.append(dt_fim)

        if tipo_os and not hasattr(tipo_os, 'default'):
            tp_clean = str(tipo_os).strip().lower()
            if tp_clean == "garantia":
                where_clauses.append("t.OBSERVACAO CONTAINING 'GARANTIA'")
            elif tp_clean == "normal" or tp_clean == "normais":
                where_clauses.append("(t.OBSERVACAO IS NULL OR NOT t.OBSERVACAO CONTAINING 'GARANTIA')")

        if where_clauses:
            sql += " WHERE " + " AND ".join(where_clauses)
            
        sql += " ORDER BY os.COD_ORDEMSERVICO DESC"
        
        if params:
            cur.execute(sql, tuple(params))
        else:
            cur.execute(sql)
        rows = cur.fetchall()

        # Batch fetch familias de lentes para as OSs retornadas
        os_ids = [r[0] for r in rows]
        fam_map = {}
        if os_ids:
            chunk_size = 500
            for i in range(0, len(os_ids), chunk_size):
                chunk = os_ids[i:i+chunk_size]
                ph = ','.join(['?'] * len(chunk))
                cur.execute(f"""
                    SELECT 
                        ti.COD_TRANSACAO,
                        COALESCE(NULLIF(TRIM(pf1.DESCRICAO), ''), NULLIF(TRIM(pf2.DESCRICAO), ''), '') AS NOME_FAMILIA
                    FROM TRANSACAO_ITEM ti
                    LEFT JOIN PRODUTO prod ON prod.COD_PRODUTO = ti.COD_ITEM
                    LEFT JOIN PRODUTOFAMILIA pf1 ON pf1.COD_PRODUTOFAMILIA = ti.COD_PRODUTOFAMILIA
                    LEFT JOIN PRODUTOFAMILIA pf2 ON pf2.COD_PRODUTOFAMILIA = prod.COD_PRODUTOFAMILIA
                    WHERE ti.COD_TRANSACAO IN ({ph})
                """, tuple(chunk))
                for ir in cur.fetchall():
                    cod_t = ir[0]
                    fam_name = ir[1].strip() if ir[1] else ''
                    if fam_name and fam_name not in fam_map.setdefault(cod_t, []):
                        fam_map[cod_t].append(fam_name)

        conn.close()
        
        result = []
        for r in rows:
            identificador = r[14] if (len(r) > 14 and r[14] is not None) else r[3]
            nome_clean = (r[4] or r[5] or '').strip() if (r[4] or r[5]) else f"Cliente {r[3]}"
            display_cliente = f"[{identificador}] {nome_clean}" if identificador else nome_clean
            is_garantia = bool(r[15]) if len(r) > 15 and r[15] is not None else False
            
            obs_raw = r[16] if len(r) > 16 else None
            obs_clean = ""
            if obs_raw:
                try:
                    obs_clean = obs_raw.read().strip() if hasattr(obs_raw, 'read') else str(obs_raw).strip()
                except Exception:
                    obs_clean = str(obs_raw).strip()

            result.append({
                "cod_ordemservico": r[0],
                "cod_empresa": r[1],
                "numero_os": r[2],
                "cod_pessoa": r[3],
                "cliente_identificador": identificador,
                "cliente_nome": display_cliente,
                "cod_naturezaoperacao": r[6].strip() if r[6] else "",
                "natureza_descricao": r[7].strip() if r[7] else "",
                "is_garantia": is_garantia,
                "observacao": obs_clean,
                "familias": fam_map.get(r[0], []),
                "total": float(r[8]) if r[8] is not None else 0.0,
                "total_produtos": float(r[9]) if r[9] is not None else 0.0,
                "total_servicos": float(r[10]) if r[10] is not None else 0.0,
                "total_icms": float(r[11]) if r[11] is not None else 0.0,
                "valor_desconto": float(r[12]) if r[12] is not None else 0.0,
                "data_emissao": str(r[13]) if r[13] else None
            })
        return result
    except Exception as e:
        logger.error(f"Erro ao listar OS: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/os/familias-garantia")
def get_os_familias_garantia(
    data_inicio: Optional[str] = Query(None),
    data_fim: Optional[str] = Query(None),
    cliente: Optional[str] = Query(None)
):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        dt_ini = sanitize_date_param(data_inicio)
        dt_fim = sanitize_date_param(data_fim)
        
        sql = """
            SELECT 
                COALESCE(ti.COD_PRODUTOFAMILIA, prod.COD_PRODUTOFAMILIA, 0) AS COD_FAMILIA,
                COALESCE(NULLIF(TRIM(pf1.DESCRICAO), ''), NULLIF(TRIM(pf2.DESCRICAO), ''), 'Outros / Sem Família') AS NOME_FAMILIA,
                SUM(ti.QUANTIDADE) AS QTD_PECAS,
                SUM(ti.TOTAL) AS VALOR_TOTAL,
                COUNT(DISTINCT t.COD_TRANSACAO) AS QTD_OS
            FROM TRANSACAO t
            JOIN TRANSACAO_ITEM ti ON ti.COD_TRANSACAO = t.COD_TRANSACAO AND ti.COD_EMPRESA = t.COD_EMPRESA
            JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = t.COD_NATUREZAOPERACAO
            LEFT JOIN PESSOA p ON p.COD_PESSOA = t.COD_PESSOA
            LEFT JOIN PRODUTO prod ON prod.COD_PRODUTO = ti.COD_ITEM
            LEFT JOIN PRODUTOFAMILIA pf1 ON pf1.COD_PRODUTOFAMILIA = ti.COD_PRODUTOFAMILIA
            LEFT JOIN PRODUTOFAMILIA pf2 ON pf2.COD_PRODUTOFAMILIA = prod.COD_PRODUTOFAMILIA
            WHERE t.COD_NATUREZAOPERACAO IN ('5.949-4', '5.949-3', '6.949-4', '5949-4', '5949-3', '6949-4', '6949-3')
              AND t.OBSERVACAO CONTAINING 'GARANTIA'
              AND (ti.COD_PRODUTOFAMILIA IS NOT NULL OR prod.COD_PRODUTOFAMILIA IS NOT NULL)
        """
        params = []
        if dt_ini:
            sql += " AND t.DATAEMISSAO >= ?"
            params.append(dt_ini)
        if dt_fim:
            sql += " AND t.DATAEMISSAO <= ?"
            params.append(dt_fim)
        
        client_clean = str(cliente).strip() if cliente and not hasattr(cliente, 'default') and str(cliente).strip() else None
        if client_clean:
            if client_clean.isdigit():
                sql += " AND (UPPER(p.NOME) LIKE UPPER(?) OR UPPER(p.RAZAOSOCIAL) LIKE UPPER(?) OR p.COD_PESSOA = ? OR p.IDENTIFICADOR = ?)"
                c_param = f"%{client_clean}%"
                params.extend([c_param, c_param, int(client_clean), int(client_clean)])
            else:
                sql += " AND (UPPER(p.NOME) LIKE UPPER(?) OR UPPER(p.RAZAOSOCIAL) LIKE UPPER(?))"
                c_param = f"%{client_clean}%"
                params.extend([c_param, c_param])

        sql += """
            GROUP BY 
                COALESCE(ti.COD_PRODUTOFAMILIA, prod.COD_PRODUTOFAMILIA, 0),
                COALESCE(NULLIF(TRIM(pf1.DESCRICAO), ''), NULLIF(TRIM(pf2.DESCRICAO), ''), 'Outros / Sem Família')
            ORDER BY SUM(ti.QUANTIDADE) DESC
        """
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        conn.close()
        
        familias = []
        total_pecas = 0.0
        total_valor = 0.0
        for gr in rows:
            q = float(gr[2]) if gr[2] is not None else 0.0
            v = float(gr[3]) if gr[3] is not None else 0.0
            total_pecas += q
            total_valor += v
            familias.append({
                "cod_familia": gr[0],
                "nome_familia": gr[1].strip() if gr[1] else f"Família {gr[0]}",
                "qtd_pecas": q,
                "valor_total": v,
                "qtd_os": int(gr[4]) if gr[4] is not None else 0
            })
        
        return {
            "data_inicio": dt_ini,
            "data_fim": dt_fim,
            "total_pecas": total_pecas,
            "total_valor": total_valor,
            "familias": familias
        }
    except Exception as e:
        logger.error(f"Erro ao buscar familias em garantia: {e}")
        return {"data_inicio": "", "data_fim": "", "total_pecas": 0.0, "total_valor": 0.0, "familias": []}

@app.get("/api/os/relatorio")
def get_os_relatorio(
    search: Optional[str] = Query(None, description="Número da OS ou código"),
    cliente: Optional[str] = Query(None, description="Filtro por nome, razão social ou documento do cliente"),
    data_inicio: Optional[str] = Query(None, description="Data inicial YYYY-MM-DD"),
    data_fim: Optional[str] = Query(None, description="Data final YYYY-MM-DD"),
    tipo_os: Optional[str] = Query("todas", description="Filtro 'todas', 'garantia' ou 'normal'"),
    limit: int = Query(0, ge=0, le=10000, description="0 = sem limite seguro")
):
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        dt_ini = sanitize_date_param(data_inicio)
        dt_fim = sanitize_date_param(data_fim)

        # 1. Buscar Ordens de Serviço com Operações Fiscais 5.949-4, 5.949-3 ou 6.949-4
        limit_val = int(limit) if limit is not None and not hasattr(limit, 'default') and int(limit) > 0 else 3000
        first_clause = f"FIRST {limit_val}"
        
        sql = f"""
            SELECT {first_clause} 
                os.COD_ORDEMSERVICO, os.COD_EMPRESA, os.NUMEROORDEMSERVICO,
                t.COD_PESSOA, CAST(p.NOME AS VARCHAR(250)), CAST(p.RAZAOSOCIAL AS VARCHAR(250)),
                t.COD_NATUREZAOPERACAO, CAST(nat.DESCRICAO AS VARCHAR(250)) AS NATUREZA_DESCRICAO,
                t.TOTAL, t.TOTALPRODUTOS, t.TOTALSERVICOS,
                COALESCE(t.TOTALICMS, 0) AS TOTALICMS,
                s.VALORDESCONTO, t.DATAEMISSAO, p.IDENTIFICADOR,
                1 AS IS_GARANTIA,
                t.OBSERVACAO
            FROM ORDEMSERVICO os
            JOIN SAIDA s ON s.COD_SAIDA = os.COD_ORDEMSERVICO AND s.COD_EMPRESA = os.COD_EMPRESA
            JOIN TRANSACAO t ON t.COD_TRANSACAO = s.COD_SAIDA AND t.COD_EMPRESA = os.COD_EMPRESA
            LEFT JOIN PESSOA p ON p.COD_PESSOA = t.COD_PESSOA
            LEFT JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = t.COD_NATUREZAOPERACAO
            WHERE t.COD_NATUREZAOPERACAO IN ('5.949-4', '5.949-3', '6.949-4', '5949-4', '5949-3', '6949-4', '6949-3')
              AND t.OBSERVACAO CONTAINING 'GARANTIA'
        """
        
        params = []
        where_clauses = []

        if dt_ini:
            where_clauses.append("t.DATAEMISSAO >= ?")
            params.append(dt_ini)
        if dt_fim:
            where_clauses.append("t.DATAEMISSAO <= ?")
            params.append(dt_fim)

        search_clean = str(search).strip() if search and not hasattr(search, 'default') and str(search).strip() else None
        if search_clean:
            if search_clean.isdigit():
                where_clauses.append("(os.NUMEROORDEMSERVICO = ? OR os.COD_ORDEMSERVICO = ?)")
                params.extend([int(search_clean), int(search_clean)])
            else:
                where_clauses.append("(UPPER(p.NOME) LIKE UPPER(?) OR UPPER(p.RAZAOSOCIAL) LIKE UPPER(?))")
                s_param = f"%{search_clean}%"
                params.extend([s_param, s_param])

        client_clean = str(cliente).strip() if cliente and not hasattr(cliente, 'default') and str(cliente).strip() else None
        if client_clean:
            if client_clean.isdigit():
                where_clauses.append("(UPPER(p.NOME) LIKE UPPER(?) OR UPPER(p.RAZAOSOCIAL) LIKE UPPER(?) OR p.COD_PESSOA = ? OR p.IDENTIFICADOR = ?)")
                c_param = f"%{client_clean}%"
                params.extend([c_param, c_param, int(client_clean), int(client_clean)])
            else:
                where_clauses.append("(UPPER(p.NOME) LIKE UPPER(?) OR UPPER(p.RAZAOSOCIAL) LIKE UPPER(?))")
                c_param = f"%{client_clean}%"
                params.extend([c_param, c_param])

        if where_clauses:
            sql += " AND " + " AND ".join(where_clauses)
            
        sql += " ORDER BY os.COD_ORDEMSERVICO DESC"
        
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()

        # Fetch famílias e itens estritamente das OSs encontradas no período pesquisado
        os_ids = [r[0] for r in rows]
        fam_map = {}
        items_by_os = {}
        fam_agg = {}

        if os_ids:
            chunk_size = 400
            for i in range(0, len(os_ids), chunk_size):
                chunk = os_ids[i:i+chunk_size]
                ph = ','.join(['?'] * len(chunk))
                cur.execute(f"""
                    SELECT 
                        ti.COD_TRANSACAO,
                        ti.COD_ITEM,
                        CAST(ti.DESCRICAO AS VARCHAR(250)),
                        ti.QUANTIDADE,
                        ti.VALORUNITARIO,
                        ti.TOTAL,
                        COALESCE(ti.COD_PRODUTOFAMILIA, prod.COD_PRODUTOFAMILIA, 0) AS COD_FAMILIA,
                        COALESCE(NULLIF(TRIM(pf1.DESCRICAO), ''), NULLIF(TRIM(pf2.DESCRICAO), ''), '') AS NOME_FAMILIA
                    FROM TRANSACAO_ITEM ti
                    LEFT JOIN PRODUTO prod ON prod.COD_PRODUTO = ti.COD_ITEM
                    LEFT JOIN PRODUTOFAMILIA pf1 ON pf1.COD_PRODUTOFAMILIA = ti.COD_PRODUTOFAMILIA
                    LEFT JOIN PRODUTOFAMILIA pf2 ON pf2.COD_PRODUTOFAMILIA = prod.COD_PRODUTOFAMILIA
                    WHERE ti.COD_TRANSACAO IN ({ph})
                    ORDER BY ti.COD_TRANSACAO, ti.COD_TRANSACAOITEM
                """, tuple(chunk))
                for ir in cur.fetchall():
                    cod_t = ir[0]
                    cod_item = ir[1]
                    desc_item = ir[2].strip() if ir[2] else ''
                    qtd = float(ir[3]) if ir[3] is not None else 0.0
                    vunit = float(ir[4]) if ir[4] is not None else 0.0
                    tot = float(ir[5]) if ir[5] is not None else 0.0
                    cod_fam = ir[6] or 0
                    nome_fam = ir[7].strip() if ir[7] else ''

                    items_by_os.setdefault(cod_t, []).append({
                        "cod_item": cod_item,
                        "descricao": desc_item,
                        "quantidade": qtd,
                        "valor_unitario": vunit,
                        "total": tot,
                        "cod_familia": cod_fam,
                        "nome_familia": nome_fam
                    })

                    if nome_fam and nome_fam not in fam_map.setdefault(cod_t, []):
                        fam_map[cod_t].append(nome_fam)

                    if nome_fam or cod_fam > 0:
                        fam_key = cod_fam if cod_fam > 0 else nome_fam
                        if fam_key not in fam_agg:
                            fam_agg[fam_key] = {
                                "cod_familia": cod_fam,
                                "nome_familia": nome_fam or f"Família {cod_fam}",
                                "qtd_pecas": 0.0,
                                "valor_total": 0.0,
                                "os_set": set()
                            }
                        fam_agg[fam_key]["qtd_pecas"] += qtd
                        fam_agg[fam_key]["valor_total"] += tot
                        fam_agg[fam_key]["os_set"].add(cod_t)

        conn.close()

        familias_garantia = []
        for fam_info in sorted(fam_agg.values(), key=lambda x: x["qtd_pecas"], reverse=True):
            familias_garantia.append({
                "cod_familia": fam_info["cod_familia"],
                "nome_familia": fam_info["nome_familia"],
                "qtd_pecas": round(fam_info["qtd_pecas"], 2),
                "valor_total": round(fam_info["valor_total"], 2),
                "qtd_os": len(fam_info["os_set"])
            })

        result_os = []
        for r in rows:
            identificador = r[14] if (len(r) > 14 and r[14] is not None) else r[3]
            nome_clean = (r[4] or r[5] or '').strip() if (r[4] or r[5]) else f"Cliente {r[3]}"
            display_cliente = f"[{identificador}] {nome_clean}" if identificador else nome_clean
            is_garantia = bool(r[15]) if len(r) > 15 and r[15] is not None else False

            obs_raw = r[16] if len(r) > 16 else None
            obs_clean = ""
            if obs_raw:
                try:
                    obs_clean = obs_raw.read().strip() if hasattr(obs_raw, 'read') else str(obs_raw).strip()
                except Exception:
                    obs_clean = str(obs_raw).strip()

            result_os.append({
                "cod_ordemservico": r[0],
                "cod_empresa": r[1],
                "numero_os": r[2],
                "cod_pessoa": r[3],
                "cliente_identificador": identificador,
                "cliente_nome": display_cliente,
                "cod_naturezaoperacao": r[6].strip() if r[6] else "",
                "natureza_descricao": r[7].strip() if r[7] else "",
                "is_garantia": is_garantia,
                "observacao": obs_clean,
                "familias": fam_map.get(r[0], []),
                "itens": items_by_os.get(r[0], []),
                "total": float(r[8]) if r[8] is not None else 0.0,
                "total_produtos": float(r[9]) if r[9] is not None else 0.0,
                "total_servicos": float(r[10]) if r[10] is not None else 0.0,
                "total_icms": float(r[11]) if r[11] is not None else 0.0,
                "valor_desconto": float(r[12]) if r[12] is not None else 0.0,
                "data_emissao": str(r[13]) if r[13] else None
            })

        total_os = len(result_os)
        total_faturamento = sum(o["total"] for o in result_os)
        total_icms = sum(o["total_icms"] for o in result_os)
        total_produtos = sum(o["total_produtos"] for o in result_os)
        total_servicos = sum(o["total_servicos"] for o in result_os)
        
        garantias_os_list = [o for o in result_os if o["is_garantia"]]
        total_garantia_os = len(garantias_os_list)
        total_garantia_valor = sum(o["total"] for o in garantias_os_list)
        total_garantia_pecas = sum(f["qtd_pecas"] for f in familias_garantia)
        percentual_garantia = round((total_garantia_os / total_os * 100), 1) if total_os > 0 else 0.0

        return {
            "periodo": {
                "data_inicio": dt_ini,
                "data_fim": dt_fim
            },
            "filtros": {
                "search": search or "",
                "cliente": cliente or "",
                "tipo_os": tipo_os or "todas"
            },
            "resumo": {
                "total_os": total_os,
                "total_faturamento": round(total_faturamento, 2),
                "total_icms": round(total_icms, 2),
                "total_produtos": round(total_produtos, 2),
                "total_servicos": round(total_servicos, 2),
                "total_garantia_os": total_garantia_os,
                "total_garantia_valor": round(total_garantia_valor, 2),
                "total_garantia_pecas": round(total_garantia_pecas, 2),
                "percentual_garantia": percentual_garantia
            },
            "familias_garantia": familias_garantia,
            "ordens_servico": result_os
        }
    except Exception as e:
        logger.error(f"Erro ao gerar relatório de OS: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/campanhas")
def get_campanhas():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT COD_SAIDAMOTIVO, DESCRICAO, ATIVO
            FROM SAIDAMOTIVO
            WHERE TIPO = 2
            ORDER BY CASE WHEN ATIVO = 'T' THEN 0 ELSE 1 END, DESCRICAO ASC
        """)
        rows = cur.fetchall()
        conn.close()

        campanhas = []
        for r in rows:
            campanhas.append({
                "cod_campanha": r[0],
                "descricao": r[1].strip() if r[1] else "",
                "ativo": (r[2] == 'T') if r[2] else False
            })
        return {"campanhas": campanhas}
    except Exception as e:
        logger.error(f"Erro ao listar campanhas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/campanhas/relatorio")
def get_campanhas_relatorio(
    cod_campanha: Optional[int] = Query(None, description="Código da campanha selecionada"),
    data_inicio: Optional[str] = Query(None, description="Data inicial YYYY-MM-DD"),
    data_fim: Optional[str] = Query(None, description="Data final YYYY-MM-DD"),
    cliente: Optional[str] = Query(None, description="Nome Fantasia, Razão Social ou código do cliente"),
    limit: int = Query(0, ge=0, description="0 = sem limite seguro")
):
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        dt_ini = sanitize_date_param(data_inicio)
        dt_fim = sanitize_date_param(data_fim)

        # Se data inicial for maior que a data final (datas invertidas ou erro), troca a ordem automaticamente
        if dt_ini and dt_fim and dt_ini > dt_fim:
            dt_ini, dt_fim = dt_fim, dt_ini

        limit_val = int(limit) if limit is not None and not hasattr(limit, 'default') and int(limit) > 0 else 0
        first_clause = f"FIRST {limit_val}" if limit_val > 0 else ""

        sql = f"""
            SELECT {first_clause}
                os.COD_ORDEMSERVICO,
                os.NUMEROORDEMSERVICO,
                os.COD_EMPRESA,
                s.COD_SAIDAMOTIVO,
                CAST(SUBSTRING(sm.DESCRICAO FROM 1 FOR 100) AS VARCHAR(100)) AS CAMPANHA_NOME,
                t.DATAEMISSAO,
                s.DATAEXPEDICAO,
                t.COD_PESSOA,
                COALESCE(NULLIF(TRIM(p.NOME), ''), NULLIF(TRIM(p.RAZAOSOCIAL), ''), 'Cliente ' || t.COD_PESSOA) AS CLIENTE_NOME_FANTASIA,
                CAST(SUBSTRING(p.RAZAOSOCIAL FROM 1 FOR 250) AS VARCHAR(250)) AS CLIENTE_RAZAO_SOCIAL,
                CAST(SUBSTRING(p.CNPJ FROM 1 FOR 25) AS VARCHAR(25)) AS CNPJ,
                CAST(SUBSTRING(p.CPF FROM 1 FOR 25) AS VARCHAR(25)) AS CPF,
                CAST(SUBSTRING(p.CIDADE FROM 1 FOR 60) AS VARCHAR(60)) AS CIDADE,
                CAST(SUBSTRING(p.COD_UF FROM 1 FOR 5) AS VARCHAR(5)) AS UF,
                p.IDENTIFICADOR,
                t.TOTAL,
                t.TOTALPRODUTOS,
                t.TOTALSERVICOS,
                COALESCE(s.VALORDESCONTO, 0) AS DESCONTO_OS,
                CAST(SUBSTRING(sit.DESCRICAO FROM 1 FOR 60) AS VARCHAR(60)) AS SITUACAO_OS,
                CAST(SUBSTRING(t.OBSERVACAO FROM 1 FOR 500) AS VARCHAR(500)) AS OBSERVACAO
            FROM ORDEMSERVICO os
            JOIN SAIDA s ON s.COD_SAIDA = os.COD_ORDEMSERVICO AND s.COD_EMPRESA = os.COD_EMPRESA
            JOIN SAIDAMOTIVO sm ON sm.COD_SAIDAMOTIVO = s.COD_SAIDAMOTIVO AND sm.TIPO = 2
            JOIN TRANSACAO t ON t.COD_TRANSACAO = s.COD_SAIDA AND t.COD_EMPRESA = os.COD_EMPRESA
            LEFT JOIN PESSOA p ON p.COD_PESSOA = t.COD_PESSOA
            LEFT JOIN ORDEMSERVICOSITUACAO sit ON sit.COD_ORDEMSERVICOSITUACAO = os.COD_ORDEMSERVICOSITUACAO
            WHERE 1=1
        """

        params = []
        if cod_campanha is not None and not hasattr(cod_campanha, 'default') and int(cod_campanha) > 0:
            sql += " AND s.COD_SAIDAMOTIVO = ?"
            params.append(int(cod_campanha))

        if dt_ini:
            sql += " AND t.DATAEMISSAO >= ?"
            params.append(dt_ini)
        if dt_fim:
            sql += " AND t.DATAEMISSAO <= ?"
            params.append(dt_fim)

        client_clean = str(cliente).strip() if cliente and not hasattr(cliente, 'default') and str(cliente).strip() else None
        if client_clean:
            if client_clean.isdigit():
                sql += " AND (p.COD_PESSOA = ? OR p.IDENTIFICADOR = ? OR UPPER(p.NOME) LIKE UPPER(?) OR UPPER(p.RAZAOSOCIAL) LIKE UPPER(?))"
                c_param = f"%{client_clean}%"
                params.extend([int(client_clean), int(client_clean), c_param, c_param])
            else:
                sql += " AND (UPPER(p.NOME) LIKE UPPER(?) OR UPPER(p.RAZAOSOCIAL) LIKE UPPER(?))"
                c_param = f"%{client_clean}%"
                params.extend([c_param, c_param])

        sql += " ORDER BY p.NOME ASC, os.COD_ORDEMSERVICO DESC"

        cur.execute(sql, tuple(params))
        header_rows = cur.fetchall()

        if not header_rows:
            conn.close()
            return {
                "filtros": {
                    "cod_campanha": cod_campanha,
                    "data_inicio": dt_ini,
                    "data_fim": dt_fim,
                    "cliente": client_clean
                },
                "totais": {
                    "total_clientes": 0,
                    "total_os": 0,
                    "total_lentes_qtd": 0,
                    "total_lentes_valor": 0.0,
                    "total_lentes_desconto": 0.0,
                    "total_servicos_qtd": 0,
                    "total_servicos_valor": 0.0,
                    "total_servicos_desconto": 0.0,
                    "total_desconto_os": 0.0,
                    "total_desconto_geral": 0.0,
                    "total_geral": 0.0
                },
                "clientes": []
            }

        os_ids = [r[0] for r in header_rows]
        items_by_os = {}

        chunk_size = 400
        for i in range(0, len(os_ids), chunk_size):
            chunk = os_ids[i:i + chunk_size]
            ph = ','.join(['?'] * len(chunk))
            cur.execute(f"""
                SELECT 
                    ti.COD_TRANSACAO,
                    ti.COD_TRANSACAOITEM,
                    ti.COD_ITEM,
                    CAST(ti.DESCRICAO AS VARCHAR(250)),
                    ti.QUANTIDADE,
                    ti.VALORORIGINAL,
                    ti.VALORUNITARIO,
                    ti.TOTAL,
                    ti.VALORDESCONTO,
                    osi.PERCENTUALDESCONTO,
                    i.COD_ITEMTIPO,
                    CAST(pf.DESCRICAO AS VARCHAR(100)) AS FAMILIA_DESCRICAO
                FROM TRANSACAO_ITEM ti
                LEFT JOIN ITEM i ON i.COD_ITEM = ti.COD_ITEM
                LEFT JOIN ORDEMSERVICO_ITEM osi ON osi.COD_TRANSACAO = ti.COD_TRANSACAO AND osi.COD_TRANSACAOITEM = ti.COD_TRANSACAOITEM AND osi.COD_EMPRESA = ti.COD_EMPRESA
                LEFT JOIN PRODUTO prod ON prod.COD_PRODUTO = ti.COD_ITEM
                LEFT JOIN PRODUTOFAMILIA pf ON pf.COD_PRODUTOFAMILIA = COALESCE(ti.COD_PRODUTOFAMILIA, prod.COD_PRODUTOFAMILIA)
                WHERE ti.COD_TRANSACAO IN ({ph})
                ORDER BY ti.COD_TRANSACAO, i.COD_ITEMTIPO, ti.COD_TRANSACAOITEM
            """, tuple(chunk))

            for ir in cur.fetchall():
                cod_transacao = ir[0]
                cod_item = str(ir[2]).strip() if ir[2] else ""
                desc_item = str(ir[3]).strip() if ir[3] else ""
                qtd = float(ir[4]) if ir[4] is not None else 0.0
                v_orig = float(ir[5]) if ir[5] is not None else 0.0
                v_unit = float(ir[6]) if ir[6] is not None else 0.0
                tot = float(ir[7]) if ir[7] is not None else 0.0
                v_desc_item = float(ir[8]) if ir[8] is not None else 0.0
                p_desc_osi = float(ir[9]) if ir[9] is not None else 0.0
                item_tipo = ir[10] if ir[10] is not None else 1
                fam_desc = str(ir[11]).strip() if ir[11] else ""

                # Desconto calculation
                v_tabela_total = v_orig * qtd if v_orig > 0 else (tot + v_desc_item)
                if v_orig > v_unit and v_orig > 0:
                    v_desc_tot = ((v_orig - v_unit) * qtd) + v_desc_item
                elif v_desc_item > 0:
                    v_desc_tot = v_desc_item
                elif p_desc_osi > 0:
                    v_desc_tot = (tot / (1.0 - (p_desc_osi / 100.0))) - tot if p_desc_osi < 100 else 0.0
                else:
                    v_desc_tot = 0.0

                v_desc_unit = (v_desc_tot / qtd) if qtd > 0 else 0.0
                if v_tabela_total > 0:
                    p_desc = round((v_desc_tot / v_tabela_total) * 100.0, 1)
                else:
                    p_desc = round(p_desc_osi, 1) if p_desc_osi > 0 else 0.0

                item_obj = {
                    "cod_item": cod_item,
                    "descricao": desc_item,
                    "quantidade": qtd,
                    "valor_original": round(v_orig, 2),
                    "desconto_unitario": round(v_desc_unit, 2),
                    "desconto_total": round(v_desc_tot, 2),
                    "perc_desconto": p_desc,
                    "valor_unitario": round(v_unit, 2),
                    "total": round(tot, 2),
                    "familia": fam_desc,
                    "is_servico": (item_tipo == 2)
                }

                items_by_os.setdefault(cod_transacao, []).append(item_obj)

        conn.close()

        # Group by Client
        clients_map = {}
        tot_geral_lentes_qtd = 0.0
        tot_geral_lentes_valor = 0.0
        tot_geral_lentes_desc = 0.0
        tot_geral_servicos_qtd = 0.0
        tot_geral_servicos_valor = 0.0
        tot_geral_servicos_desc = 0.0
        tot_geral_desconto_os = 0.0
        tot_geral_faturado = 0.0

        for r in header_rows:
            cod_os = r[0]
            num_os = r[1]
            cod_empresa = r[2]
            cod_motivo = r[3]
            nome_campanha = r[4].strip() if r[4] else "Campanha"
            dt_emissao = str(r[5]) if r[5] else None
            dt_expedicao = str(r[6]) if r[6] else None
            cod_pessoa = r[7] or 0
            nome_fantasia = r[8].strip() if r[8] else f"Cliente {cod_pessoa}"
            razao_social = r[9].strip() if r[9] else ""
            cnpj = r[10].strip() if r[10] else ""
            cpf = r[11].strip() if r[11] else ""
            cidade = r[12].strip() if r[12] else ""
            uf = r[13].strip() if r[13] else ""
            identificador = r[14] or cod_pessoa
            tot_os = float(r[15]) if r[15] is not None else 0.0
            tot_produtos = float(r[16]) if r[16] is not None else 0.0
            tot_servicos = float(r[17]) if r[17] is not None else 0.0
            desc_os = float(r[18]) if r[18] is not None else 0.0
            situacao = r[19].strip() if r[19] else ""
            obs = r[20].strip() if r[20] else ""

            os_items = items_by_os.get(cod_os, [])
            lentes = [it for it in os_items if not it["is_servico"]]
            servicos = [it for it in os_items if it["is_servico"]]

            os_lentes_qtd = sum(it["quantidade"] for it in lentes)
            os_lentes_val = sum(it["total"] for it in lentes)
            os_lentes_desc = sum(it["desconto_total"] for it in lentes)

            os_servicos_qtd = sum(it["quantidade"] for it in servicos)
            os_servicos_val = sum(it["total"] for it in servicos)
            os_servicos_desc = sum(it["desconto_total"] for it in servicos)

            os_desc_total = os_lentes_desc + os_servicos_desc + desc_os

            client_key = cod_pessoa
            if client_key not in clients_map:
                clients_map[client_key] = {
                    "cod_pessoa": cod_pessoa,
                    "identificador": identificador,
                    "nome_fantasia": nome_fantasia,
                    "razao_social": razao_social,
                    "cnpj_cpf": cnpj or cpf or "",
                    "cidade": cidade,
                    "uf": uf,
                    "totais": {
                        "total_os": 0,
                        "total_lentes_qtd": 0.0,
                        "total_lentes_valor": 0.0,
                        "total_lentes_desconto": 0.0,
                        "total_servicos_qtd": 0.0,
                        "total_servicos_valor": 0.0,
                        "total_servicos_desconto": 0.0,
                        "total_desconto_os": 0.0,
                        "total_desconto_geral": 0.0,
                        "total_geral": 0.0
                    },
                    "ordens_servico": []
                }

            c_totals = clients_map[client_key]["totais"]
            c_totals["total_os"] += 1
            c_totals["total_lentes_qtd"] += os_lentes_qtd
            c_totals["total_lentes_valor"] += os_lentes_val
            c_totals["total_lentes_desconto"] += os_lentes_desc
            c_totals["total_servicos_qtd"] += os_servicos_qtd
            c_totals["total_servicos_valor"] += os_servicos_val
            c_totals["total_servicos_desconto"] += os_servicos_desc
            c_totals["total_desconto_os"] += desc_os
            c_totals["total_desconto_geral"] += os_desc_total
            c_totals["total_geral"] += tot_os

            tot_geral_lentes_qtd += os_lentes_qtd
            tot_geral_lentes_valor += os_lentes_val
            tot_geral_lentes_desc += os_lentes_desc
            tot_geral_servicos_qtd += os_servicos_qtd
            tot_geral_servicos_valor += os_servicos_val
            tot_geral_servicos_desc += os_servicos_desc
            tot_geral_desconto_os += desc_os
            tot_geral_faturado += tot_os

            clients_map[client_key]["ordens_servico"].append({
                "cod_ordemservico": cod_os,
                "numero_os": num_os,
                "cod_empresa": cod_empresa,
                "data_emissao": dt_emissao,
                "data_expedicao": dt_expedicao,
                "cod_campanha": cod_motivo,
                "campanha_nome": nome_campanha,
                "situacao_os": situacao,
                "observacao": obs,
                "total_produtos": round(tot_produtos, 2),
                "total_servicos": round(tot_servicos, 2),
                "desconto_os": round(desc_os, 2),
                "total_geral": round(tot_os, 2),
                "desconto_total": round(os_desc_total, 2),
                "lentes": lentes,
                "servicos": servicos
            })

        for c in clients_map.values():
            ct = c["totais"]
            ct["total_lentes_qtd"] = round(ct["total_lentes_qtd"], 2)
            ct["total_lentes_valor"] = round(ct["total_lentes_valor"], 2)
            ct["total_lentes_desconto"] = round(ct["total_lentes_desconto"], 2)
            ct["total_servicos_qtd"] = round(ct["total_servicos_qtd"], 2)
            ct["total_servicos_valor"] = round(ct["total_servicos_valor"], 2)
            ct["total_servicos_desconto"] = round(ct["total_servicos_desconto"], 2)
            ct["total_desconto_os"] = round(ct["total_desconto_os"], 2)
            ct["total_desconto_geral"] = round(ct["total_desconto_geral"], 2)
            ct["total_geral"] = round(ct["total_geral"], 2)

        clientes_list = sorted(clients_map.values(), key=lambda x: x["nome_fantasia"].upper())

        tot_geral_desc = tot_geral_lentes_desc + tot_geral_servicos_desc + tot_geral_desconto_os

        return {
            "filtros": {
                "cod_campanha": cod_campanha,
                "data_inicio": dt_ini,
                "data_fim": dt_fim,
                "cliente": client_clean
            },
            "totais": {
                "total_clientes": len(clientes_list),
                "total_os": len(header_rows),
                "total_lentes_qtd": round(tot_geral_lentes_qtd, 2),
                "total_lentes_valor": round(tot_geral_lentes_valor, 2),
                "total_lentes_desconto": round(tot_geral_lentes_desc, 2),
                "total_servicos_qtd": round(tot_geral_servicos_qtd, 2),
                "total_servicos_valor": round(tot_geral_servicos_valor, 2),
                "total_servicos_desconto": round(tot_geral_servicos_desc, 2),
                "total_desconto_os": round(tot_geral_desconto_os, 2),
                "total_desconto_geral": round(tot_geral_desc, 2),
                "total_geral": round(tot_geral_faturado, 2)
            },
            "clientes": clientes_list
        }
    except Exception as e:
        logger.error(f"Erro ao gerar relatório de campanhas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/os/{cod_os}")
def get_os_detail(cod_os: int, cod_empresa: int = 1):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Header
        cur.execute("""
            SELECT 
                os.COD_ORDEMSERVICO, os.COD_EMPRESA, os.NUMEROORDEMSERVICO,
                t.COD_PESSOA, COALESCE(NULLIF(TRIM(p.NOME), ''), NULLIF(TRIM(p.RAZAOSOCIAL), ''), 'Cliente ' || t.COD_PESSOA) AS CLIENTE_NOME,
                t.COD_NATUREZAOPERACAO, nat.DESCRICAO AS NATUREZA_DESCRICAO,
                t.TOTAL, t.TOTALPRODUTOS, t.TOTALSERVICOS, t.TOTALICMS,
                s.VALORDESCONTO, t.DATAEMISSAO,
                t.TOTALISSQN, t.TOTALIPI, t.TOTALPIS, t.TOTALCOFINS, t.TOTALICMSSUBSTITUICAO
            FROM ORDEMSERVICO os
            JOIN SAIDA s ON s.COD_SAIDA = os.COD_ORDEMSERVICO AND s.COD_EMPRESA = os.COD_EMPRESA
            JOIN TRANSACAO t ON t.COD_TRANSACAO = s.COD_SAIDA AND t.COD_EMPRESA = os.COD_EMPRESA
            LEFT JOIN PESSOA p ON p.COD_PESSOA = t.COD_PESSOA
            LEFT JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = t.COD_NATUREZAOPERACAO
            WHERE os.COD_ORDEMSERVICO = ? AND os.COD_EMPRESA = ?
        """, (cod_os, cod_empresa))
        
        header_row = cur.fetchone()
        if not header_row:
            conn.close()
            raise HTTPException(status_code=404, detail=f"Ordem de Serviço {cod_os} não encontrada.")
            
        header = {
            "cod_ordemservico": header_row[0],
            "cod_empresa": header_row[1],
            "numero_os": header_row[2],
            "cod_pessoa": header_row[3],
            "cliente_nome": header_row[4].strip() if header_row[4] else "N/A",
            "cod_naturezaoperacao": header_row[5].strip() if header_row[5] else "",
            "natureza_descricao": header_row[6].strip() if header_row[6] else "",
            "total": float(header_row[7]) if header_row[7] is not None else 0.0,
            "total_produtos": float(header_row[8]) if header_row[8] is not None else 0.0,
            "total_servicos": float(header_row[9]) if header_row[9] is not None else 0.0,
            "total_icms": float(header_row[10]) if header_row[10] is not None else 0.0,
            "valor_desconto": float(header_row[11]) if header_row[11] is not None else 0.0,
            "data_emissao": str(header_row[12]) if header_row[12] else None,
            "total_issqn": float(header_row[13]) if header_row[13] is not None else 0.0,
            "total_ipi": float(header_row[14]) if header_row[14] is not None else 0.0,
            "total_pis": float(header_row[15]) if header_row[15] is not None else 0.0,
            "total_cofins": float(header_row[16]) if header_row[16] is not None else 0.0,
            "total_icms_st": float(header_row[17]) if header_row[17] is not None else 0.0
        }
        
        # Items
        cur.execute("""
            SELECT 
                ti.COD_TRANSACAOITEM, ti.COD_ITEM, ti.DESCRICAO,
                ti.QUANTIDADE, ti.VALORUNITARIO, ti.TOTAL, ti.VALORDESCONTO,
                ti.COD_NATUREZAOPERACAO, nat.DESCRICAO AS NATUREZA_DESCRICAO,
                ti.ALIQUOTAICMS, ti.BASECALCULOICMS, ti.TOTALICMS, ti.TRIBUTACAOICMS,
                ti.TOTALISSQN, ti.ALIQUOTAISSQN, ti.TOTALIPI, ti.ALIQUOTAIPI,
                ti.TOTALPIS, ti.ALIQUOTAPIS, ti.TOTALCOFINS, ti.ALIQUOTACOFINS,
                ti.TOTALICMSSUBSTITUICAO, ti.VALORORIGINAL,
                pf_direct.PRECO AS FAMILIA_DIRECT_PRECO,
                pf_prod.PRECO AS FAMILIA_PROD_PRECO,
                i.PRECOVENDA AS ITEM_PRECOVENDA,
                ti.ALIQUOTAICMSDIFERIMENTO
            FROM TRANSACAO_ITEM ti
            LEFT JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = ti.COD_NATUREZAOPERACAO
            LEFT JOIN PRODUTOFAMILIA pf_direct ON pf_direct.COD_PRODUTOFAMILIA = ti.COD_PRODUTOFAMILIA
            LEFT JOIN ITEM i ON i.COD_ITEM = ti.COD_ITEM
            LEFT JOIN PRODUTO p ON CAST(p.COD_PRODUTO AS VARCHAR(20)) = TRIM(ti.COD_ITEM)
            LEFT JOIN PRODUTOFAMILIA pf_prod ON pf_prod.COD_PRODUTOFAMILIA = p.COD_PRODUTOFAMILIA
            WHERE ti.COD_TRANSACAO = ? AND ti.COD_EMPRESA = ?
            ORDER BY ti.COD_TRANSACAOITEM
        """, (cod_os, cod_empresa))
        
        item_rows = cur.fetchall()
        conn.close()
        
        items = []
        for ir in item_rows:
            qtd = float(ir[3]) if ir[3] is not None else 0.0
            vunit = float(ir[4]) if ir[4] is not None else 0.0
            val_total = float(ir[5]) if ir[5] is not None else 0.0
            val_desc_raw = float(ir[6]) if ir[6] is not None else 0.0
            val_orig_raw = float(ir[22]) if len(ir) > 22 and ir[22] is not None and float(ir[22]) > 0 else 0.0
            fam_direct_preco = float(ir[23]) if len(ir) > 23 and ir[23] is not None and float(ir[23]) > 0 else 0.0
            fam_prod_preco = float(ir[24]) if len(ir) > 24 and ir[24] is not None and float(ir[24]) > 0 else 0.0
            item_precovenda = float(ir[25]) if len(ir) > 25 and ir[25] is not None and float(ir[25]) > 0 else 0.0
            aliq_dif = float(ir[26]) if len(ir) > 26 and ir[26] is not None else 0.0
            cst_str = ir[12].strip() if ir[12] else "00"
            aliq_nom = float(ir[9]) if ir[9] is not None else 0.0
            base_icms = float(ir[10]) if ir[10] is not None else 0.0
            tot_icms = float(ir[11]) if ir[11] is not None else 0.0

            # CST 51 = Diferimento parcial/total do ICMS
            is_diferimento = cst_str in ('51', '051', '151', '251')
            icms_operacao = 0.0
            icms_diferido = 0.0

            if is_diferimento and aliq_nom > 0 and base_icms > 0:
                # ICMS da operação (cheio, sem diferimento)
                icms_operacao = base_icms * (aliq_nom / 100.0)

                # Se % diferimento não veio do banco, aplicar diferimento parcial padrão (12% efetivo)
                if aliq_dif == 0.0 and aliq_nom > 12.0:
                    aliq_dif = ((aliq_nom - 12.0) / aliq_nom) * 100.0

                # Recalcular ICMS com diferimento
                icms_diferido = icms_operacao * (aliq_dif / 100.0)
                tot_icms = round(icms_operacao - icms_diferido, 2)
            else:
                icms_operacao = base_icms * (aliq_nom / 100.0) if aliq_nom > 0 else tot_icms
                icms_diferido = 0.0
                tot_icms = round(icms_operacao, 2)

            # Priority for original unit list price (Preço de Venda da Família da Lente):
            # 1. Direct item transaction lens family price (pf_direct.PRECO)
            # 2. Product lens family price (pf_prod.PRECO)
            # 3. Item catalog sales price (i.PRECOVENDA)
            # 4. Item transaction original price (ti.VALORORIGINAL)
            # 5. Net unit price + discount per unit
            if fam_direct_preco > 0:
                vunit_orig = fam_direct_preco
            elif fam_prod_preco > 0:
                vunit_orig = fam_prod_preco
            elif item_precovenda > 0:
                vunit_orig = item_precovenda
            elif val_orig_raw > 0:
                vunit_orig = val_orig_raw
            else:
                vunit_orig = vunit + (val_desc_raw / qtd if qtd > 0 else 0.0)

            total_bruto = vunit_orig * qtd
            val_desc = max(0.0, total_bruto - val_total)
            pct_desc = (val_desc / total_bruto * 100.0) if total_bruto > 0 else 0.0

            items.append({
                "cod_transacaoitem": ir[0],
                "cod_item": ir[1].strip() if ir[1] else "",
                "descricao": ir[2].strip() if ir[2] else "",
                "quantidade": qtd,
                "valorunitario": vunit,
                "total": val_total,
                "valordesconto": val_desc,
                "valor_original": vunit_orig,
                "percentual_desconto": pct_desc,
                "cod_naturezaoperacao": ir[7].strip() if ir[7] else "",
                "natureza_descricao": ir[8].strip() if ir[8] else "",
                "aliquotaicms": aliq_nom,
                "aliquotaicmsdiferimento": round(aliq_dif, 4),
                "basecalculoicms": base_icms,
                "icms_operacao": round(icms_operacao, 2),
                "icms_diferido": round(icms_diferido, 2),
                "totalicms": tot_icms,
                "tributacaoicms": cst_str,
                "totalissqn": float(ir[13]) if ir[13] is not None else 0.0,
                "aliquotaissqn": float(ir[14]) if ir[14] is not None else 0.0,
                "totalipi": float(ir[15]) if ir[15] is not None else 0.0,
                "aliquotapi": float(ir[16]) if ir[16] is not None else 0.0,
                "totalpis": float(ir[17]) if ir[17] is not None else 0.0,
                "aliquotapis": float(ir[18]) if ir[18] is not None else 0.0,
                "totalcofins": float(ir[19]) if ir[19] is not None else 0.0,
                "aliquotacofins": float(ir[20]) if ir[20] is not None else 0.0,
                "totalicmssubstituicao": float(ir[21]) if ir[21] is not None else 0.0
            })

        if items:
            header["total_icms_operacao"] = round(sum(it.get("icms_operacao", 0.0) for it in items), 2)
            header["total_icms_diferido"] = round(sum(it.get("icms_diferido", 0.0) for it in items), 2)
            header["total_icms"] = round(sum(it.get("totalicms", 0.0) for it in items), 2)
        else:
            header["total_icms_operacao"] = header["total_icms"]
            header["total_icms_diferido"] = 0.0
            
        return {
            "header": header,
            "items": items
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao buscar detalhes da OS {cod_os}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/os/{cod_os}")
def update_os(cod_os: int, data: OSUpdateModel):
    if cod_os != data.cod_ordemservico:
        raise HTTPException(status_code=400, detail="Código da OS na URL não coincide com o corpo da requisição.")
        
    logger.info(f"Atualizando OS {cod_os} no banco '{ACTIVE_DB_KEY}': Total OS = R$ {data.total:.2f}, ICMS = R$ {data.total_icms:.2f}, ISS = R$ {(data.total_issqn or 0):.2f}, IPI = R$ {(data.total_ipi or 0):.2f}, PIS = R$ {(data.total_pis or 0):.2f}, COFINS = R$ {(data.total_cofins or 0):.2f}")
    
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        
        # 1. Update Header TRANSACAO (Totais Globais de Tributos & Operação Fiscal)
        cur.execute("""
            UPDATE TRANSACAO
            SET COD_NATUREZAOPERACAO = ?,
                TOTALICMS = ?,
                TOTALISSQN = ?,
                TOTALIPI = ?,
                TOTALPIS = ?,
                TOTALCOFINS = ?,
                TOTALICMSSUBSTITUICAO = ?,
                TOTAL = ?
            WHERE COD_TRANSACAO = ? AND COD_EMPRESA = ?
        """, (
            data.cod_naturezaoperacao if data.cod_naturezaoperacao else None,
            Decimal(f"{data.total_icms:.4f}"),
            Decimal(f"{(data.total_issqn or 0.0):.4f}"),
            Decimal(f"{(data.total_ipi or 0.0):.4f}"),
            Decimal(f"{(data.total_pis or 0.0):.4f}"),
            Decimal(f"{(data.total_cofins or 0.0):.4f}"),
            Decimal(f"{(data.total_icms_st or 0.0):.4f}"),
            Decimal(f"{data.total:.4f}"),
            data.cod_ordemservico,
            data.cod_empresa
        ))
        
        # 2. Update Header SAIDA (Desconto)
        cur.execute("""
            UPDATE SAIDA
            SET VALORDESCONTO = ?
            WHERE COD_SAIDA = ? AND COD_EMPRESA = ?
        """, (
            Decimal(f"{(data.valordesconto or 0.0):.4f}"),
            data.cod_ordemservico,
            data.cod_empresa
        ))
        
        # 3. Update Items (Valores, CFOP, ICMS, ISSQN, IPI, PIS, COFINS, ST)
        for item in data.items:
            cur.execute("""
                UPDATE TRANSACAO_ITEM
                SET DESCRICAO = ?,
                    QUANTIDADE = ?,
                    VALORUNITARIO = ?,
                    TOTAL = ?,
                    COD_NATUREZAOPERACAO = ?,
                    ALIQUOTAICMS = ?,
                    ALIQUOTAICMSDIFERIMENTO = ?,
                    BASECALCULOICMS = ?,
                    TOTALICMS = ?,
                    TRIBUTACAOICMS = ?,
                    TOTALISSQN = ?,
                    ALIQUOTAISSQN = ?,
                    TOTALIPI = ?,
                    ALIQUOTAIPI = ?,
                    TOTALPIS = ?,
                    ALIQUOTAPIS = ?,
                    TOTALCOFINS = ?,
                    ALIQUOTACOFINS = ?,
                    TOTALICMSSUBSTITUICAO = ?
                WHERE COD_TRANSACAO = ? AND COD_EMPRESA = ? AND COD_TRANSACAOITEM = ?
            """, (
                item.descricao,
                Decimal(f"{item.quantidade:.4f}"),
                Decimal(f"{item.valorunitario:.4f}"),
                Decimal(f"{item.total:.4f}"),
                item.cod_naturezaoperacao if item.cod_naturezaoperacao else None,
                Decimal(f"{(item.aliquotaicms or 0.0):.4f}"),
                Decimal(f"{(item.aliquotaicmsdiferimento or 0.0):.4f}"),
                Decimal(f"{(item.basecalculoicms or 0.0):.4f}"),
                Decimal(f"{(item.totalicms or 0.0):.4f}"),
                item.tributacaoicms if item.tributacaoicms else "00",
                Decimal(f"{(item.totalissqn or 0.0):.4f}"),
                Decimal(f"{(item.aliquotaissqn or 0.0):.4f}"),
                Decimal(f"{(item.totalipi or 0.0):.4f}"),
                Decimal(f"{(item.aliquotapi or 0.0):.4f}"),
                Decimal(f"{(item.totalpis or 0.0):.4f}"),
                Decimal(f"{(item.aliquotapis or 0.0):.4f}"),
                Decimal(f"{(item.totalcofins or 0.0):.4f}"),
                Decimal(f"{(item.aliquotacofins or 0.0):.4f}"),
                Decimal(f"{(item.totalicmssubstituicao or 0.0):.4f}"),
                data.cod_ordemservico,
                data.cod_empresa,
                item.cod_transacaoitem
            ))
            
        conn.commit()
        conn.close()
        logger.info(f"OS {cod_os} atualizada com sucesso no Firebird!")
        return {"status": "success", "message": f"Ordem de Serviço #{data.cod_ordemservico} atualizada com sucesso no banco de dados!"}
    except Exception as e:
        conn.rollback()
        conn.close()
        logger.error(f"Erro ao atualizar OS {cod_os}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao salvar no banco de dados: {str(e)}")

ENQUADRAMENTO_MAP = {
    0: "Nenhum",
    1: "Simples Nacional",
    2: "Outro",
    3: "MEI"
}

@app.get("/api/clientes")
def get_clientes_report(
    search: Optional[str] = Query(None, description="Busca por Nome, Razão Social, CNPJ ou IE"),
    enquadramento: Optional[str] = Query(None, description="todos, 0, 1, 2, 3")
):
    try:
        search_str = search.strip() if isinstance(search, str) and search.strip() else None
        enq_str = enquadramento.strip() if isinstance(enquadramento, str) and enquadramento.strip() else None

        conn = get_db_connection()
        cur = conn.cursor()
        
        sql = """
            SELECT 
                p.COD_PESSOA,
                COALESCE(p.NOME, p.RAZAOSOCIAL, '') AS NOME,
                COALESCE(p.RAZAOSOCIAL, '') AS RAZAOSOCIAL,
                COALESCE(p.CNPJ, p.CPF, '') AS DOCUMENTO,
                COALESCE(p.IE, 'ISENTO') AS IE,
                COALESCE(c.ENQUADRAMENTOFISCAL, 0) AS ENQUADRAMENTOFISCAL
            FROM PESSOA p
            LEFT JOIN CLIENTE c ON c.COD_CLIENTE = p.COD_PESSOA
            WHERE (p.ATIVO = 'T' OR p.ATIVO = 'S' OR p.ATIVO = '1')
              AND (p.PESSOACLIENTE = 'T' OR p.PESSOACLIENTE = 'S' OR p.PESSOACLIENTE = '1')
        """
        
        params = []
        if enq_str and enq_str != 'todos' and enq_str.isdigit():
            sql += " AND COALESCE(c.ENQUADRAMENTOFISCAL, 0) = ?"
            params.append(int(enq_str))
            
        if search_str:
            s = f"%{search_str.upper()}%"
            sql += """ AND (
                UPPER(p.NOME) LIKE ? OR 
                UPPER(p.RAZAOSOCIAL) LIKE ? OR 
                p.CNPJ LIKE ? OR 
                p.CPF LIKE ? OR 
                UPPER(p.IE) LIKE ?
            )"""
            params.extend([s, s, s, s, s])
            
        sql += " ORDER BY COALESCE(p.NOME, p.RAZAOSOCIAL)"
        
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        conn.close()
        
        result = []
        for r in rows:
            cod_pessoa = r[0]
            nome = r[1].strip() if r[1] else ""
            razaosocial = r[2].strip() if r[2] else ""
            documento = r[3].strip() if r[3] else ""
            ie = r[4].strip() if r[4] else "ISENTO"
            enq_code = r[5]
            enq_desc = ENQUADRAMENTO_MAP.get(enq_code, "Nenhum")
            
            result.append({
                "cod_pessoa": cod_pessoa,
                "nome": nome,
                "nome_fantasia": nome,
                "razao_social": razaosocial,
                "cnpj_cpf": documento,
                "ie": ie,
                "enquadramento_codigo": enq_code,
                "enquadramento_descricao": enq_desc
            })
            
        return result
    except Exception as e:
        logger.error(f"Erro ao gerar relatório de clientes por enquadramento fiscal: {e}")
        raise HTTPException(status_code=500, detail=str(e))

TIPO_OPERACAO_MAP = {
    1: "🛒 Vendas",
    2: "📥 Compras / Entradas",
    3: "🔄 Devoluções e Trocas",
    4: "🚚 Transferências",
    5: "📦 Empréstimos e Demonstração",
    6: "🎁 Amostra Grátis",
    8: "🛠️ Remessas e Serviços",
    9: "🎁 Bonificação, Doação e Brindes",
    10: "🏭 Industrialização / Encomenda",
    11: "📅 Vendas p/ Entrega Futura",
    12: "🏢 Venda de Imobilizado / Ativo",
    13: "⚠️ Baixa / Perda / Roubo",
    14: "🛡️ Remessa / Troca em Garantia",
    15: "↩️ Retorno de Insumos",
    21: "🤝 Remessa por Conta e Ordem"
}

@app.get("/api/tipos-natureza")
@app.get("/api/naturezas/tipos")
def get_tipos_natureza():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT TIPO
            FROM NATUREZAOPERACAO
            WHERE TIPO IS NOT NULL
            ORDER BY TIPO
        """)
        rows = cur.fetchall()
        conn.close()
        
        result = []
        for r in rows:
            tipo_id = r[0]
            if tipo_id is not None:
                nome = TIPO_OPERACAO_MAP.get(tipo_id, f"Outros (Tipo {tipo_id})")
                result.append({
                    "tipo": tipo_id,
                    "descricao": nome
                })
        return result
    except Exception as e:
        logger.error(f"Erro ao buscar tipos de natureza de operação: {e}")
        return []

@app.get("/api/produtos/mais-vendidos")
def get_produtos_mais_vendidos(
    ordenar_por: Optional[str] = Query("valor", description="Métrica de ordenação: 'valor' ou 'quantidade'"),
    limit: int = Query(20, ge=0, le=500, description="Quantidade de registros a retornar (0 para todos)"),
    tipo_operacao: Optional[str] = Query(None, description="Filtrar por TIPO da Operação Fiscal"),
    tipo_item: Optional[str] = Query("todos", description="Classificação do item: 'todos', 'produtos' ou 'servicos'"),
    data_inicio: Optional[str] = Query(None, description="Data inicial no formato YYYY-MM-DD"),
    data_fim: Optional[str] = Query(None, description="Data final no formato YYYY-MM-DD"),
    search: Optional[str] = Query(None, description="Busca por nome ou código do produto")
):
    try:
        search_clean = str(search).strip().upper() if search and not hasattr(search, 'default') and str(search).strip() else None
        
        raw_order = str(ordenar_por) if ordenar_por and not hasattr(ordenar_por, 'default') else "valor"
        order_metric = "quantidade" if "quantidade" in raw_order.lower() else "valor"
        
        limit_val = 20
        if limit is not None and not hasattr(limit, 'default'):
            try:
                limit_val = int(limit)
            except (ValueError, TypeError):
                limit_val = 20
                
        tipos_op_clean = []
        is_explicit_todos = False
        if tipo_operacao and not hasattr(tipo_operacao, 'default'):
            tp_str = str(tipo_operacao).strip()
            if tp_str.lower() == 'todos':
                is_explicit_todos = True
            elif tp_str:
                for part in tp_str.split(','):
                    part_clean = part.strip()
                    if part_clean.isdigit():
                        tipos_op_clean.append(int(part_clean))

        # Se nenhum tipo específico for informado e não for solicitado 'todos' explicitamente,
        # considera APENAS operações de venda (TIPO = 1: Vendas e TIPO = 11: Vendas p/ Entrega Futura)
        if not tipos_op_clean and not is_explicit_todos:
            tipos_op_clean = [1, 11]

        tipo_item_clean = str(tipo_item).strip().lower() if tipo_item and not hasattr(tipo_item, 'default') else "todos"

        dt_ini = sanitize_date_param(data_inicio)
        dt_fim = sanitize_date_param(data_fim)

        conn = get_db_connection()
        cur = conn.cursor()
        
        first_clause = f"FIRST {limit_val}" if limit_val > 0 else ""

        sql = f"""
            SELECT {first_clause}
                ti.COD_ITEM,
                COALESCE(NULLIF(TRIM(ti.DESCRICAO), ''), NULLIF(TRIM(i.DESCRICAO), ''), 'Item ' || ti.COD_ITEM) AS DESCRICAO,
                SUM(ti.QUANTIDADE) AS QTD_TOTAL,
                SUM(ti.TOTAL) AS VALOR_TOTAL,
                COUNT(DISTINCT ti.COD_TRANSACAO) AS QTD_VENDAS
            FROM TRANSACAO_ITEM ti
            JOIN TRANSACAO t ON t.COD_TRANSACAO = ti.COD_TRANSACAO AND t.COD_EMPRESA = ti.COD_EMPRESA
            LEFT JOIN ITEM i ON i.COD_ITEM = ti.COD_ITEM
            LEFT JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = t.COD_NATUREZAOPERACAO
            WHERE ti.COD_ITEM IS NOT NULL AND TRIM(ti.COD_ITEM) <> ''
              AND t.SITUACAO = 3
              AND (ti.FATURADO IS NULL OR ti.FATURADO IN ('T', 'S'))
        """
        
        params = []
        
        if tipos_op_clean:
            if len(tipos_op_clean) == 1:
                sql += " AND nat.TIPO = ?"
                params.append(tipos_op_clean[0])
            else:
                placeholders = ', '.join(['?'] * len(tipos_op_clean))
                sql += f" AND nat.TIPO IN ({placeholders})"
                params.extend(tipos_op_clean)

        if tipo_item_clean == "produtos":
            sql += " AND (ti.QUANTIDADEPRODUTO > 0 OR (COALESCE(ti.QUANTIDADESERVICO, 0) = 0 AND COALESCE(ti.TOTALISSQN, 0) = 0))"
        elif tipo_item_clean == "servicos":
            sql += " AND (ti.QUANTIDADESERVICO > 0 OR COALESCE(ti.TOTALISSQN, 0) > 0 OR COALESCE(ti.ALIQUOTAISSQN, 0) > 0)"

        if dt_ini:
            sql += " AND t.DATAEMISSAO >= ?"
            params.append(dt_ini)
            
        if dt_fim:
            sql += " AND t.DATAEMISSAO <= ?"
            params.append(dt_fim)
            
        if search_clean:
            sql += " AND (UPPER(ti.COD_ITEM) LIKE ? OR UPPER(ti.DESCRICAO) LIKE ? OR UPPER(i.DESCRICAO) LIKE ?)"
            s_param = f"%{search_clean}%"
            params.extend([s_param, s_param, s_param])
            
        sql += """
            GROUP BY ti.COD_ITEM, COALESCE(NULLIF(TRIM(ti.DESCRICAO), ''), NULLIF(TRIM(i.DESCRICAO), ''), 'Item ' || ti.COD_ITEM)
        """
        
        if order_metric == "quantidade":
            sql += " ORDER BY SUM(ti.QUANTIDADE) DESC, SUM(ti.TOTAL) DESC"
        else:
            sql += " ORDER BY SUM(ti.TOTAL) DESC, SUM(ti.QUANTIDADE) DESC"
            
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        conn.close()
        
        items = []
        total_faturamento = 0.0
        total_quantidade = 0.0
        
        for idx, r in enumerate(rows, start=1):
            cod_item = r[0].strip() if r[0] else ""
            descricao = r[1].strip() if r[1] else f"Item {cod_item}"
            qtd = float(r[2]) if r[2] is not None else 0.0
            val_total = float(r[3]) if r[3] is not None else 0.0
            qtd_vendas = int(r[4]) if r[4] is not None else 0
            preco_medio = (val_total / qtd) if qtd > 0 else 0.0
            
            total_faturamento += val_total
            total_quantidade += qtd
            
            items.append({
                "ranking": idx,
                "cod_item": cod_item,
                "descricao": descricao,
                "quantidade": qtd,
                "valor_total": val_total,
                "qtd_vendas": qtd_vendas,
                "preco_medio": preco_medio
            })
            
        ticket_medio = (total_faturamento / total_quantidade) if total_quantidade > 0 else 0.0
        
        return {
            "ordenar_por": order_metric,
            "total_produtos_distintos": len(items),
            "total_faturamento": total_faturamento,
            "total_quantidade": total_quantidade,
            "ticket_medio_item": ticket_medio,
            "items": items
        }
    except Exception as e:
        logger.error(f"Erro ao buscar produtos mais vendidos: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/cidades")
def get_cidades():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT UPPER(TRIM(CIDADE))
            FROM PESSOA
            WHERE CIDADE IS NOT NULL AND TRIM(CIDADE) <> ''
              AND (ATIVO = 'T' OR ATIVO = 'S' OR ATIVO IS NULL OR ATIVO = '1')
            ORDER BY 1
        """)
        rows = cur.fetchall()
        conn.close()
        return [r[0] for r in rows if r[0]]
    except Exception as e:
        logger.error(f"Erro ao buscar lista de cidades: {e}")
        return []

@app.get("/api/clientes/mais-compraram")
def get_clientes_mais_compraram(
    ordenar_por: Optional[str] = Query("valor", description="Métrica: 'valor' ou 'quantidade'"),
    limit: int = Query(20, ge=0, le=500),
    tipo_operacao: Optional[str] = Query(None, description="Tipos de operação separados por vírgula"),
    tipo_item: Optional[str] = Query("todos", description="Classificação do item: 'todos', 'produtos' ou 'servicos'"),
    cidade: Optional[str] = Query(None, description="Filtro por nome da cidade"),
    data_inicio: Optional[str] = Query(None, description="Data inicial YYYY-MM-DD"),
    data_fim: Optional[str] = Query(None, description="Data final YYYY-MM-DD"),
    search: Optional[str] = Query(None, description="Busca por nome, documento ou código")
):
    try:
        search_clean = str(search).strip().upper() if search and not hasattr(search, 'default') and str(search).strip() else None
        cidade_clean = str(cidade).strip().upper() if cidade and not hasattr(cidade, 'default') and str(cidade).strip() and str(cidade).lower() != 'todas' else None

        raw_order = str(ordenar_por) if ordenar_por and not hasattr(ordenar_por, 'default') else "valor"
        order_metric = "quantidade" if "quantidade" in raw_order.lower() else "valor"

        limit_val = 20
        if limit is not None and not hasattr(limit, 'default'):
            try:
                limit_val = int(limit)
            except (ValueError, TypeError):
                limit_val = 20

        tipos_op_clean = []
        is_explicit_todos = False
        if tipo_operacao and not hasattr(tipo_operacao, 'default'):
            tp_str = str(tipo_operacao).strip()
            if tp_str.lower() == 'todos':
                is_explicit_todos = True
            elif tp_str:
                for part in tp_str.split(','):
                    part_clean = part.strip()
                    if part_clean.isdigit():
                        tipos_op_clean.append(int(part_clean))

        # Se nenhum tipo específico for informado e não for solicitado 'todos' explicitamente,
        # considera TODOS os tipos de operação que representam vendas e faturamento para clientes:
        # 1 (Vendas), 8 (Remessas e Serviços), 9 (Bonificação/Brindes), 10 (Industrialização), 11 (Vendas Entrega Futura), 12 (Venda de Ativo/Imobilizado)
        if not tipos_op_clean and not is_explicit_todos:
            tipos_op_clean = [1, 8, 9, 10, 11, 12]

        tipo_item_clean = str(tipo_item).strip().lower() if tipo_item and not hasattr(tipo_item, 'default') else "todos"

        dt_ini = sanitize_date_param(data_inicio)
        dt_fim = sanitize_date_param(data_fim)

        conn = get_db_connection()
        cur = conn.cursor()

        where_clauses = [
            "p.COD_PESSOA IS NOT NULL",
            "(p.ATIVO = 'T' OR p.ATIVO = 'S' OR p.ATIVO IS NULL OR p.ATIVO = '1')",
            "t.SITUACAO = 3",
            "(ti.FATURADO IS NULL OR ti.FATURADO IN ('T', 'S'))",
            "(nat.ENTRADA IS NULL OR nat.ENTRADA IN ('F', 'N'))"
        ]
        params = []

        if tipos_op_clean:
            if len(tipos_op_clean) == 1:
                where_clauses.append("nat.TIPO = ?")
                params.append(tipos_op_clean[0])
            else:
                placeholders = ', '.join(['?'] * len(tipos_op_clean))
                where_clauses.append(f"nat.TIPO IN ({placeholders})")
                params.extend(tipos_op_clean)

        if tipo_item_clean == "produtos":
            where_clauses.append("(ti.QUANTIDADEPRODUTO > 0 OR (COALESCE(ti.QUANTIDADESERVICO, 0) = 0 AND COALESCE(ti.TOTALISSQN, 0) = 0))")
        elif tipo_item_clean == "servicos":
            where_clauses.append("(ti.QUANTIDADESERVICO > 0 OR COALESCE(ti.TOTALISSQN, 0) > 0 OR COALESCE(ti.ALIQUOTAISSQN, 0) > 0)")

        if cidade_clean:
            where_clauses.append("UPPER(TRIM(p.CIDADE)) = ?")
            params.append(cidade_clean)

        if dt_ini:
            where_clauses.append("t.DATAEMISSAO >= ?")
            params.append(dt_ini)

        if dt_fim:
            where_clauses.append("t.DATAEMISSAO <= ?")
            params.append(dt_fim)

        if search_clean:
            where_clauses.append("(UPPER(p.NOME) LIKE ? OR UPPER(p.RAZAOSOCIAL) LIKE ? OR p.CNPJ LIKE ? OR p.CPF LIKE ? OR CAST(p.COD_PESSOA AS VARCHAR(20)) LIKE ?)")
            s_param = f"%{search_clean}%"
            params.extend([s_param, s_param, s_param, s_param, s_param])

        where_sql = " AND ".join(where_clauses)

        first_clause = f"FIRST {limit_val}" if limit_val > 0 else ""
        order_sql = "ORDER BY SUM(ti.TOTAL) DESC, SUM(ti.QUANTIDADE) DESC" if order_metric == "valor" else "ORDER BY SUM(ti.QUANTIDADE) DESC, SUM(ti.TOTAL) DESC"

        sql_customers = f"""
            SELECT {first_clause}
                p.COD_PESSOA,
                COALESCE(NULLIF(TRIM(p.NOME), ''), NULLIF(TRIM(p.RAZAOSOCIAL), ''), 'Cliente ' || p.COD_PESSOA) AS NOME_FANTASIA,
                COALESCE(NULLIF(TRIM(p.RAZAOSOCIAL), ''), '') AS RAZAO_SOCIAL,
                COALESCE(NULLIF(TRIM(p.CIDADE), ''), 'NÃO INFORMADA') AS CIDADE,
                COALESCE(p.CNPJ, p.CPF, '') AS DOCUMENTO,
                SUM(ti.QUANTIDADE) AS QTD_TOTAL,
                SUM(ti.TOTAL) AS VALOR_TOTAL,
                COUNT(DISTINCT t.COD_TRANSACAO) AS QTD_COMPRAS
            FROM TRANSACAO_ITEM ti
            JOIN TRANSACAO t ON t.COD_TRANSACAO = ti.COD_TRANSACAO AND t.COD_EMPRESA = ti.COD_EMPRESA
            JOIN PESSOA p ON p.COD_PESSOA = t.COD_PESSOA
            LEFT JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = t.COD_NATUREZAOPERACAO
            LEFT JOIN ITEM i ON i.COD_ITEM = ti.COD_ITEM
            WHERE {where_sql}
            GROUP BY p.COD_PESSOA, COALESCE(NULLIF(TRIM(p.NOME), ''), NULLIF(TRIM(p.RAZAOSOCIAL), ''), 'Cliente ' || p.COD_PESSOA), COALESCE(NULLIF(TRIM(p.RAZAOSOCIAL), ''), ''), COALESCE(NULLIF(TRIM(p.CIDADE), ''), 'NÃO INFORMADA'), COALESCE(p.CNPJ, p.CPF, '')
            {order_sql}
        """

        cur.execute(sql_customers, tuple(params))
        customer_rows = cur.fetchall()

        items = []
        total_faturamento = 0.0
        total_quantidade = 0.0
        total_compras = 0

        for idx, r in enumerate(customer_rows, start=1):
            cod_pessoa = r[0]
            nome_fantasia = r[1].strip() if r[1] else f"Cliente {cod_pessoa}"
            razao_social = r[2].strip() if r[2] else ""
            cid = r[3].strip() if r[3] else "NÃO INFORMADA"
            doc = r[4].strip() if r[4] else ""
            qtd = float(r[5]) if r[5] is not None else 0.0
            val_total = float(r[6]) if r[6] is not None else 0.0
            qtd_trans = int(r[7]) if r[7] is not None else 0
            preco_medio = (val_total / qtd) if qtd > 0 else 0.0

            total_faturamento += val_total
            total_quantidade += qtd
            total_compras += qtd_trans

            items.append({
                "ranking": idx,
                "cod_pessoa": cod_pessoa,
                "nome_cliente": nome_fantasia,
                "nome_fantasia": nome_fantasia,
                "razao_social": razao_social,
                "cidade": cid,
                "documento": doc,
                "quantidade": qtd,
                "valor_total": val_total,
                "qtd_compras": qtd_trans,
                "preco_medio_item": preco_medio
            })

        sql_cities = f"""
            SELECT 
                COALESCE(NULLIF(TRIM(p.CIDADE), ''), 'NÃO INFORMADA') AS CIDADE,
                SUM(ti.TOTAL) AS VALOR_TOTAL,
                SUM(ti.QUANTIDADE) AS QTD_TOTAL,
                COUNT(DISTINCT p.COD_PESSOA) AS QTD_CLIENTES,
                COUNT(DISTINCT t.COD_TRANSACAO) AS QTD_TRANSACOES
            FROM TRANSACAO_ITEM ti
            JOIN TRANSACAO t ON t.COD_TRANSACAO = ti.COD_TRANSACAO AND t.COD_EMPRESA = ti.COD_EMPRESA
            JOIN PESSOA p ON p.COD_PESSOA = t.COD_PESSOA
            LEFT JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = t.COD_NATUREZAOPERACAO
            LEFT JOIN ITEM i ON i.COD_ITEM = ti.COD_ITEM
            WHERE {where_sql}
            GROUP BY COALESCE(NULLIF(TRIM(p.CIDADE), ''), 'NÃO INFORMADA')
            ORDER BY SUM(ti.TOTAL) DESC
        """

        cur.execute(sql_cities, tuple(params))
        city_rows = cur.fetchall()
        conn.close()

        cidades_agrupadas = []
        for cr in city_rows:
            cidades_agrupadas.append({
                "cidade": cr[0].strip() if cr[0] else "NÃO INFORMADA",
                "faturamento": float(cr[1]) if cr[1] is not None else 0.0,
                "quantidade": float(cr[2]) if cr[2] is not None else 0.0,
                "qtd_clientes": int(cr[3]) if cr[3] is not None else 0,
                "qtd_transacoes": int(cr[4]) if cr[4] is not None else 0
            })

        ticket_medio = (total_faturamento / len(items)) if len(items) > 0 else 0.0

        return {
            "ordenar_por": order_metric,
            "total_clientes_distintos": len(items),
            "total_cidades": len(cidades_agrupadas),
            "total_faturamento": total_faturamento,
            "total_quantidade": total_quantidade,
            "total_compras": total_compras,
            "ticket_medio_cliente": ticket_medio,
            "items": items,
            "cidades_agrupadas": cidades_agrupadas
        }
    except Exception as e:
        logger.error(f"Erro ao buscar clientes que mais compraram: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/familias/autocomplete")
def get_familias_autocomplete(
    q: str = Query(..., min_length=1, description="Termo de busca da família"),
    limit: int = Query(20, ge=1, le=100)
):
    try:
        q_clean = q.strip().upper()
        conn = get_db_connection()
        cur = conn.cursor()
        
        if q_clean.isdigit():
            cur.execute(f"""
                SELECT FIRST {limit} COD_PRODUTOFAMILIA, DESCRICAO
                FROM PRODUTOFAMILIA
                WHERE COD_PRODUTOFAMILIA = ? OR UPPER(DESCRICAO) LIKE ?
                ORDER BY DESCRICAO
            """, (int(q_clean), f"%{q_clean}%"))
        else:
            cur.execute(f"""
                SELECT FIRST {limit} COD_PRODUTOFAMILIA, DESCRICAO
                FROM PRODUTOFAMILIA
                WHERE UPPER(DESCRICAO) LIKE ?
                ORDER BY DESCRICAO
            """, (f"%{q_clean}%",))
            
        rows = cur.fetchall()
        conn.close()
        
        return [
            {
                "cod_familia": r[0],
                "descricao": r[1].strip() if r[1] else f"Família {r[0]}"
            }
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Erro no autocomplete de famílias: {e}")
        return []

# Lista de materiais, índices e tratamentos óticos padrão
OPTICAL_MATERIAL_WORDS = {
    'ORMA', 'POLY', 'POLI', 'TFL', 'CR39', 'CR-39', 'CR', 'CRISTAL', 'RESINA', 
    '1.50', '1.55', '1.56', '1.59', '1.60', '1.67', '1.74', 
    'TRIVEX', 'AIRWEAR', 'ACCLIMATES', 'TRANSITIONS', 'TRANS', 'UHD', 'NO',
    'BCO', 'BRANCO', 'BRANCA', 'FOTO', 'CINZA', 'MARROM', 'VERDE',
    'OD', 'OE', 'AO', '70MM', '65MM', '60MM', '75MM', '78MM'
}

def parse_search_query(raw_search: str):
    """
    Interpreta a busca do usuário.
    Se contiver aspas duplas ou simples (ex: "ESPACE" ou "KODAK PRECISE"), ativa is_exact_phrase=True.
    Também suporta operadores de exclusão com '-' (ex: -PLUS, -NEXT).
    Retorna: (clean_term, is_exact_phrase, excluded_terms)
    """
    if not raw_search:
        return '', False, []
    raw = str(raw_search).strip()
    is_exact_phrase = ('"' in raw) or ("'" in raw)
    parts = raw.split()
    excluded_terms = []
    positive_parts = []
    for p in parts:
        clean_p = p.strip('"\'')
        if clean_p.startswith('-') and len(clean_p) > 1:
            excluded_terms.append(clean_p[1:].upper())
        else:
            positive_parts.append(p)
    clean_term = ' '.join(positive_parts).replace('"', '').replace("'", "").strip().upper()
    return clean_term, is_exact_phrase, excluded_terms

def matches_optical_phrase(description: str, phrase: str, is_exact_phrase: bool, excluded_terms: list = None) -> bool:
    """
    Valida se a descrição atende ao termo e aos critérios de busca exata e exclusão.
    - Se houver excluded_terms, qualquer descrição com esse termo é eliminada.
    - Se is_exact_phrase=True, valida que a frase buscada é o produto base,
      não aceitando palavras de sub-modelos posteriores (ex: PLUS, NEXT, SHORT, MAX).
    """
    if not description:
        return False
    desc_upper = description.upper()
    if excluded_terms:
        for ex in excluded_terms:
            if ex in desc_upper:
                return False
    if not phrase:
        return True
    if not is_exact_phrase:
        return phrase in desc_upper
    tokens = desc_upper.split()
    p_tokens = phrase.split()
    n = len(p_tokens)
    for i in range(len(tokens) - n + 1):
        if tokens[i:i+n] == p_tokens:
            if i + n == len(tokens):
                return True
            next_word = tokens[i+n].strip('(),-./')
            if next_word in OPTICAL_MATERIAL_WORDS:
                return True
            if next_word.isdigit() or any(c in next_word for c in ['+', '-', '/']):
                return True
            return False
    return False

@app.get("/api/clientes/compraram-familia")
def get_clientes_compraram_familia(
    search: Optional[str] = Query(None, description="Descrição ou código do produto, lente ou família"),
    familia: Optional[str] = Query(None, description="Compatibilidade com termo de busca"),
    descricao: Optional[str] = Query(None, description="Compatibilidade com termo de busca"),
    ordenar_por: Optional[str] = Query("valor", description="Métrica de ordenação: 'valor', 'quantidade' ou 'nome'"),
    limit: int = Query(50, ge=0, le=500),
    tipo_operacao: Optional[str] = Query(None, description="Tipos de operação separados por vírgula"),
    data_inicio: Optional[str] = Query(None, description="Data inicial YYYY-MM-DD"),
    data_fim: Optional[str] = Query(None, description="Data final YYYY-MM-DD")
):
    try:
        raw_search = search or familia or descricao or ""
        clean_term, is_exact_phrase, excluded_terms = parse_search_query(raw_search)

        if not clean_term and not excluded_terms:
            return {
                "ordenar_por": "valor",
                "termo_pesquisado": "",
                "total_itens_encontrados": 0,
                "total_familias_encontradas": 0,
                "familias_encontradas": [],
                "total_clientes_distintos": 0,
                "total_faturamento": 0.0,
                "total_quantidade": 0.0,
                "total_compras": 0,
                "ticket_medio_cliente": 0.0,
                "items": []
            }

        conn = get_db_connection()
        cur = conn.cursor()

        # 1. Localizar famílias correspondentes pela descrição ou ID
        familias_encontradas = []
        family_ids = []
        s_upper = clean_term.upper()
        s_lower = clean_term.lower()
        s_title = clean_term.title()

        if clean_term.isdigit():
            cur.execute("""
                SELECT COD_PRODUTOFAMILIA, DESCRICAO 
                FROM PRODUTOFAMILIA 
                WHERE COD_PRODUTOFAMILIA = ? OR DESCRICAO LIKE ? OR DESCRICAO LIKE ? OR DESCRICAO LIKE ?
                ORDER BY DESCRICAO
            """, (int(clean_term), f"%{s_upper}%", f"%{s_lower}%", f"%{s_title}%"))
        else:
            cur.execute("""
                SELECT COD_PRODUTOFAMILIA, DESCRICAO 
                FROM PRODUTOFAMILIA 
                WHERE DESCRICAO LIKE ? OR DESCRICAO LIKE ? OR DESCRICAO LIKE ?
                ORDER BY DESCRICAO
            """, (f"%{s_upper}%", f"%{s_lower}%", f"%{s_title}%"))
        
        f_rows = cur.fetchall()
        for r in f_rows:
            if r[0] is not None:
                desc = r[1].strip() if r[1] else f"Família {r[0]}"
                if matches_optical_phrase(desc, clean_term, is_exact_phrase, excluded_terms):
                    family_ids.append(r[0])
                    familias_encontradas.append({
                        "cod_familia": r[0],
                        "descricao": desc
                    })

        # 2. Localizar itens correspondentes pela descrição ou código do item
        # Evitamos UPPER(DESCRICAO) para prevenir erro SQL -802 do Firebird em caracteres legados corrompidos
        if clean_term.isdigit():
            cur.execute("""
                SELECT FIRST 1000 COD_ITEM, DESCRICAO 
                FROM ITEM 
                WHERE COD_ITEM = ? OR DESCRICAO LIKE ? OR DESCRICAO LIKE ? OR DESCRICAO LIKE ? OR COD_ITEM LIKE ?
            """, (clean_term, f"%{s_upper}%", f"%{s_lower}%", f"%{s_title}%", f"%{s_upper}%"))
        else:
            cur.execute("""
                SELECT FIRST 1000 COD_ITEM, DESCRICAO 
                FROM ITEM 
                WHERE COD_ITEM LIKE ? OR DESCRICAO LIKE ? OR DESCRICAO LIKE ? OR DESCRICAO LIKE ?
            """, (f"%{s_upper}%", f"%{s_upper}%", f"%{s_lower}%", f"%{s_title}%"))
        i_rows = cur.fetchall()
        item_codes = [
            r[0].strip() for r in i_rows 
            if r[0] and matches_optical_phrase(r[1] or "", clean_term, is_exact_phrase, excluded_terms)
        ]

        if not family_ids and not item_codes:
            conn.close()
            return {
                "ordenar_por": "valor",
                "termo_pesquisado": raw_search,
                "total_itens_encontrados": 0,
                "total_familias_encontradas": 0,
                "familias_encontradas": [],
                "total_clientes_distintos": 0,
                "total_faturamento": 0.0,
                "total_quantidade": 0.0,
                "total_compras": 0,
                "ticket_medio_cliente": 0.0,
                "items": []
            }

        # Configurar ordenação e limites
        raw_order = str(ordenar_por) if ordenar_por and not hasattr(ordenar_por, 'default') else "valor"
        if "quantidade" in raw_order.lower():
            order_metric = "quantidade"
            order_sql = "ORDER BY 5 DESC, 6 DESC"
        elif "nome" in raw_order.lower():
            order_metric = "nome"
            order_sql = "ORDER BY 2 ASC"
        else:
            order_metric = "valor"
            order_sql = "ORDER BY 6 DESC, 5 DESC"

        limit_val = 50
        if limit is not None and not hasattr(limit, 'default'):
            try:
                limit_val = int(limit)
            except (ValueError, TypeError):
                limit_val = 50

        # Filtros de Operação Fiscal
        tipos_op_clean = []
        is_explicit_todos = False
        if tipo_operacao and not hasattr(tipo_operacao, 'default'):
            tp_str = str(tipo_operacao).strip()
            if tp_str.lower() == 'todos':
                is_explicit_todos = True
            elif tp_str:
                for part in tp_str.split(','):
                    part_clean = part.strip()
                    if part_clean.isdigit():
                        tipos_op_clean.append(int(part_clean))

        if not tipos_op_clean and not is_explicit_todos:
            tipos_op_clean = [1, 8, 9, 10, 11, 12]

        dt_ini = sanitize_date_param(data_inicio)
        dt_fim = sanitize_date_param(data_fim)

        # Montar filtros comuns para cada ramo do UNION ALL
        branch_where = [
            "t.SITUACAO = 3",
            "(ti.FATURADO IS NULL OR ti.FATURADO IN ('T', 'S'))"
        ]
        branch_params = []

        if tipos_op_clean:
            if len(tipos_op_clean) == 1:
                branch_where.append("nat.TIPO = ?")
                branch_params.append(tipos_op_clean[0])
            else:
                ph_nat = ', '.join(['?'] * len(tipos_op_clean))
                branch_where.append(f"nat.TIPO IN ({ph_nat})")
                branch_params.extend(tipos_op_clean)

        if dt_ini:
            branch_where.append("t.DATAEMISSAO >= ?")
            branch_params.append(dt_ini)

        if dt_fim:
            branch_where.append("t.DATAEMISSAO <= ?")
            branch_params.append(dt_fim)

        branch_where_sql = " AND ".join(branch_where)

        union_branches = []
        all_params = []

        # Ramo 1: Famílias diretamente no ti.COD_PRODUTOFAMILIA
        if family_ids:
            max_batch = 800
            for i in range(0, min(len(family_ids), 3200), max_batch):
                batch_f = family_ids[i:i + max_batch]
                ph_fam = ', '.join(['?'] * len(batch_f))
                union_branches.append(f"""
                    SELECT t.COD_PESSOA, SUM(ti.QUANTIDADE) AS QTD, SUM(ti.TOTAL) AS VALOR, COUNT(ti.COD_TRANSACAO) AS COMPRAS
                    FROM TRANSACAO_ITEM ti
                    JOIN TRANSACAO t ON t.COD_TRANSACAO = ti.COD_TRANSACAO AND t.COD_EMPRESA = ti.COD_EMPRESA
                    LEFT JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = t.COD_NATUREZAOPERACAO
                    WHERE {branch_where_sql}
                      AND ti.COD_PRODUTOFAMILIA IN ({ph_fam})
                    GROUP BY t.COD_PESSOA
                """)
                all_params.extend(branch_params + batch_f)
        # Ramo 2: Itens avulsos que contêm a descrição no nome do item (quando a busca é por item específico)
        elif item_codes:
            max_batch = 800
            for i in range(0, min(len(item_codes), 1600), max_batch):
                batch = item_codes[i:i + max_batch]
                ph_item = ', '.join(['?'] * len(batch))

                union_branches.append(f"""
                    SELECT t.COD_PESSOA, SUM(ti.QUANTIDADE) AS QTD, SUM(ti.TOTAL) AS VALOR, COUNT(ti.COD_TRANSACAO) AS COMPRAS
                    FROM TRANSACAO_ITEM ti
                    JOIN TRANSACAO t ON t.COD_TRANSACAO = ti.COD_TRANSACAO AND t.COD_EMPRESA = ti.COD_EMPRESA
                    LEFT JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = t.COD_NATUREZAOPERACAO
                    WHERE {branch_where_sql}
                      AND ti.COD_ITEM IN ({ph_item})
                    GROUP BY t.COD_PESSOA
                """)
                all_params.extend(branch_params + batch)

        union_sql_body = " UNION ALL ".join(union_branches)
        first_clause = f"FIRST {limit_val}" if limit_val > 0 else ""

        sql_union = f"""
            SELECT {first_clause}
                u.COD_PESSOA,
                COALESCE(NULLIF(TRIM(p.NOME), ''), NULLIF(TRIM(p.RAZAOSOCIAL), ''), 'Cliente ' || u.COD_PESSOA) AS NOME_FANTASIA,
                COALESCE(NULLIF(TRIM(p.RAZAOSOCIAL), ''), '') AS RAZAO_SOCIAL,
                COALESCE(NULLIF(TRIM(p.CIDADE), ''), 'NÃO INFORMADA') AS CIDADE,
                COALESCE(p.CNPJ, p.CPF, '') AS DOCUMENTO,
                SUM(u.QTD) AS QTD_TOTAL,
                SUM(u.VALOR) AS VALOR_TOTAL,
                SUM(u.COMPRAS) AS QTD_COMPRAS
            FROM ({union_sql_body}) u
            JOIN PESSOA p ON p.COD_PESSOA = u.COD_PESSOA
            WHERE (p.ATIVO = 'T' OR p.ATIVO = 'S' OR p.ATIVO IS NULL OR p.ATIVO = '1')
            GROUP BY u.COD_PESSOA, 
                     COALESCE(NULLIF(TRIM(p.NOME), ''), NULLIF(TRIM(p.RAZAOSOCIAL), ''), 'Cliente ' || u.COD_PESSOA), 
                     COALESCE(NULLIF(TRIM(p.RAZAOSOCIAL), ''), ''), 
                     COALESCE(NULLIF(TRIM(p.CIDADE), ''), 'NÃO INFORMADA'), 
                     COALESCE(p.CNPJ, p.CPF, '')
            {order_sql}
        """

        cur.execute(sql_union, tuple(all_params))
        rows = cur.fetchall()
        conn.close()

        items = []
        total_faturamento = 0.0
        total_quantidade = 0.0
        total_compras = 0

        for idx, r in enumerate(rows, start=1):
            cod_pessoa = r[0]
            nome_fantasia = r[1].strip() if r[1] else f"Cliente {cod_pessoa}"
            razao_social = r[2].strip() if r[2] else ""
            cid = r[3].strip() if r[3] else "NÃO INFORMADA"
            doc = r[4].strip() if r[4] else ""
            qtd = float(r[5]) if r[5] is not None else 0.0
            val_total = float(r[6]) if r[6] is not None else 0.0
            qtd_compras = int(r[7]) if r[7] is not None else 0
            preco_medio = (val_total / qtd) if qtd > 0 else 0.0

            total_faturamento += val_total
            total_quantidade += qtd
            total_compras += qtd_compras

            items.append({
                "ranking": idx,
                "cod_pessoa": cod_pessoa,
                "nome_fantasia": nome_fantasia,
                "nome_cliente": nome_fantasia,
                "razao_social": razao_social,
                "cidade": cid,
                "documento": doc,
                "quantidade": qtd,
                "valor_total": val_total,
                "qtd_compras": qtd_compras,
                "preco_medio_item": preco_medio
            })

        ticket_medio = (total_faturamento / len(items)) if len(items) > 0 else 0.0

        return {
            "ordenar_por": order_metric,
            "termo_pesquisado": raw_search,
            "total_itens_encontrados": len(item_codes),
            "total_familias_encontradas": len(familias_encontradas),
            "familias_encontradas": familias_encontradas[:20],
            "total_clientes_distintos": len(items),
            "total_faturamento": total_faturamento,
            "total_quantidade": total_quantidade,
            "total_compras": total_compras,
            "ticket_medio_cliente": ticket_medio,
            "items": items
        }
    except Exception as e:
        logger.error(f"Erro ao buscar clientes que compraram: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/clientes/{cod_pessoa}/itens-comprados")
def get_cliente_itens_comprados(
    cod_pessoa: int,
    search: Optional[str] = Query(None, description="Descrição ou código do item ou família pesquisada"),
    descricao: Optional[str] = Query(None),
    familia: Optional[str] = Query(None),
    tipo_operacao: Optional[str] = Query(None),
    data_inicio: Optional[str] = Query(None),
    data_fim: Optional[str] = Query(None),
    limit: int = Query(1500, ge=0, le=5000)
):
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # 1. Informações cadastrais do cliente
        cur.execute("""
            SELECT COD_PESSOA, 
                   COALESCE(NULLIF(TRIM(NOME), ''), NULLIF(TRIM(RAZAOSOCIAL), ''), 'Cliente ' || COD_PESSOA) AS NOME_FANTASIA,
                   COALESCE(NULLIF(TRIM(RAZAOSOCIAL), ''), '') AS RAZAO_SOCIAL,
                   COALESCE(NULLIF(TRIM(CIDADE), ''), 'NÃO INFORMADA') AS CIDADE,
                   COALESCE(CNPJ, CPF, '') AS DOCUMENTO,
                   COALESCE(TELEFONECOMERCIAL1, TELEFONECELULAR, '') AS TELEFONE,
                   COALESCE(EMAIL, '') AS EMAIL
            FROM PESSOA
            WHERE COD_PESSOA = ?
        """, (cod_pessoa,))
        c_row = cur.fetchone()
        if not c_row:
            conn.close()
            raise HTTPException(status_code=404, detail="Cliente não encontrado")

        cliente_info = {
            "cod_pessoa": c_row[0],
            "nome_fantasia": c_row[1].strip() if c_row[1] else f"Cliente {cod_pessoa}",
            "nome_cliente": c_row[1].strip() if c_row[1] else f"Cliente {cod_pessoa}",
            "razao_social": c_row[2].strip() if c_row[2] else "",
            "cidade": c_row[3].strip() if c_row[3] else "NÃO INFORMADA",
            "documento": c_row[4].strip() if c_row[4] else "",
            "telefone": c_row[5].strip() if c_row[5] else "",
            "email": c_row[6].strip() if c_row[6] else ""
        }

        # 2. Localizar IDs de famílias e códigos de itens que contêm o termo
        raw_search = search or descricao or familia or ""
        clean_term, is_exact_phrase, excluded_terms = parse_search_query(raw_search)

        family_ids = []
        item_codes = []
        if clean_term:
            s_upper = clean_term.upper()
            s_lower = clean_term.lower()
            s_title = clean_term.title()

            if clean_term.isdigit():
                cur.execute("""
                    SELECT COD_PRODUTOFAMILIA, DESCRICAO 
                    FROM PRODUTOFAMILIA 
                    WHERE COD_PRODUTOFAMILIA = ? OR DESCRICAO LIKE ? OR DESCRICAO LIKE ? OR DESCRICAO LIKE ?
                """, (int(clean_term), f"%{s_upper}%", f"%{s_lower}%", f"%{s_title}%"))
            else:
                cur.execute("""
                    SELECT COD_PRODUTOFAMILIA, DESCRICAO 
                    FROM PRODUTOFAMILIA 
                    WHERE DESCRICAO LIKE ? OR DESCRICAO LIKE ? OR DESCRICAO LIKE ?
                """, (f"%{s_upper}%", f"%{s_lower}%", f"%{s_title}%"))
            f_rows = cur.fetchall()
            family_ids = [
                r[0] for r in f_rows 
                if r[0] is not None and matches_optical_phrase(r[1] or "", clean_term, is_exact_phrase, excluded_terms)
            ]

            if clean_term.isdigit():
                cur.execute("""
                    SELECT FIRST 1000 COD_ITEM, DESCRICAO 
                    FROM ITEM 
                    WHERE COD_ITEM = ? OR DESCRICAO LIKE ? OR DESCRICAO LIKE ? OR DESCRICAO LIKE ? OR COD_ITEM LIKE ?
                """, (clean_term, f"%{s_upper}%", f"%{s_lower}%", f"%{s_title}%", f"%{s_upper}%"))
            else:
                cur.execute("""
                    SELECT FIRST 1000 COD_ITEM, DESCRICAO 
                    FROM ITEM 
                    WHERE COD_ITEM LIKE ? OR DESCRICAO LIKE ? OR DESCRICAO LIKE ? OR DESCRICAO LIKE ?
                """, (f"%{s_upper}%", f"%{s_upper}%", f"%{s_lower}%", f"%{s_title}%"))
            i_rows = cur.fetchall()
            item_codes = [
                r[0].strip() for r in i_rows 
                if r[0] and matches_optical_phrase(r[1] or "", clean_term, is_exact_phrase, excluded_terms)
            ]

        # 3. Tipos de operação e datas
        tipos_op_clean = []
        is_explicit_todos = False
        if tipo_operacao and not hasattr(tipo_operacao, 'default'):
            tp_str = str(tipo_operacao).strip()
            if tp_str.lower() == 'todos':
                is_explicit_todos = True
            elif tp_str:
                for part in tp_str.split(','):
                    part_clean = part.strip()
                    if part_clean.isdigit():
                        tipos_op_clean.append(int(part_clean))

        if not tipos_op_clean and not is_explicit_todos:
            tipos_op_clean = [1, 8, 9, 10, 11, 12]

        dt_ini = sanitize_date_param(data_inicio)
        dt_fim = sanitize_date_param(data_fim)
        limit_val = 1500
        if limit is not None and not hasattr(limit, 'default'):
            try:
                limit_val = int(limit)
            except (ValueError, TypeError):
                limit_val = 1500

        first_clause = f"FIRST {limit_val}" if limit_val > 0 else ""

        sql = f"""
            SELECT {first_clause}
                COALESCE(ti.COD_PRODUTOFAMILIA, prod.COD_PRODUTOFAMILIA, 0) AS COD_FAMILIA,
                COALESCE(NULLIF(TRIM(pf1.DESCRICAO), ''), NULLIF(TRIM(pf2.DESCRICAO), ''), NULLIF(TRIM(i.DESCRICAO), ''), 'Família ' || COALESCE(ti.COD_PRODUTOFAMILIA, prod.COD_PRODUTOFAMILIA, 0)) AS NOME_FAMILIA,
                SUM(ti.QUANTIDADE) AS QTD_TOTAL,
                SUM(ti.TOTAL) AS VALOR_TOTAL,
                COUNT(DISTINCT t.COD_TRANSACAO) AS QTD_COMPRAS,
                MAX(t.DATAEMISSAO) AS ULTIMA_COMPRA,
                MIN(t.DATAEMISSAO) AS PRIMEIRA_COMPRA
            FROM TRANSACAO t
            JOIN TRANSACAO_ITEM ti ON ti.COD_TRANSACAO = t.COD_TRANSACAO AND ti.COD_EMPRESA = t.COD_EMPRESA
            LEFT JOIN ITEM i ON i.COD_ITEM = ti.COD_ITEM
            LEFT JOIN PRODUTO prod ON prod.COD_PRODUTO = ti.COD_ITEM
            LEFT JOIN PRODUTOFAMILIA pf1 ON pf1.COD_PRODUTOFAMILIA = ti.COD_PRODUTOFAMILIA
            LEFT JOIN PRODUTOFAMILIA pf2 ON pf2.COD_PRODUTOFAMILIA = prod.COD_PRODUTOFAMILIA
            LEFT JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = t.COD_NATUREZAOPERACAO
            WHERE t.SITUACAO = 3
              AND (ti.FATURADO IS NULL OR ti.FATURADO IN ('T', 'S'))
              AND t.COD_PESSOA = ?
        """
        params = [cod_pessoa]

        if family_ids or item_codes:
            item_conditions = []
            if family_ids:
                max_batch = 800
                batch_f_conditions = []
                for idx in range(0, min(len(family_ids), 3200), max_batch):
                    sub_f = family_ids[idx:idx + max_batch]
                    ph_f = ', '.join(['?'] * len(sub_f))
                    batch_f_conditions.append(f"ti.COD_PRODUTOFAMILIA IN ({ph_f})")
                    params.extend(sub_f)
                if batch_f_conditions:
                    item_conditions.append("(" + " OR ".join(batch_f_conditions) + ")")

            if item_codes:
                max_batch = 800
                batch_conditions = []
                for idx in range(0, min(len(item_codes), 1600), max_batch):
                    sub_b = item_codes[idx:idx + max_batch]
                    ph_i = ', '.join(['?'] * len(sub_b))
                    batch_conditions.append(f"ti.COD_ITEM IN ({ph_i})")
                    params.extend(sub_b)
                if batch_conditions:
                    item_conditions.append("(" + " OR ".join(batch_conditions) + ")")

            if item_conditions:
                sql += " AND (" + " OR ".join(item_conditions) + ")"

        if tipos_op_clean:
            if len(tipos_op_clean) == 1:
                sql += " AND nat.TIPO = ?"
                params.append(tipos_op_clean[0])
            else:
                ph_nat = ', '.join(['?'] * len(tipos_op_clean))
                sql += f" AND nat.TIPO IN ({ph_nat})"
                params.extend(tipos_op_clean)

        if dt_ini:
            sql += " AND t.DATAEMISSAO >= ?"
            params.append(dt_ini)

        if dt_fim:
            sql += " AND t.DATAEMISSAO <= ?"
            params.append(dt_fim)

        sql += """
            GROUP BY 1, 2
            ORDER BY 4 DESC, 3 DESC
        """

        cur.execute(sql, tuple(params))
        item_rows = cur.fetchall()
        conn.close()

        items = []
        total_quantidade = 0.0
        total_faturamento = 0.0
        total_compras = 0

        for r in item_rows:
            cod_fam = r[0]
            nome_fam = r[1].strip() if r[1] else f"Família {cod_fam}"
            qtd = float(r[2]) if r[2] is not None else 0.0
            val_total = float(r[3]) if r[3] is not None else 0.0
            qtd_compras = int(r[4]) if r[4] is not None else 0
            dt_ult = r[5].strftime('%Y-%m-%d') if r[5] else ""
            dt_prim = r[6].strftime('%Y-%m-%d') if r[6] else ""
            preco_medio = (val_total / qtd) if qtd > 0 else 0.0

            total_quantidade += qtd
            total_faturamento += val_total
            total_compras += qtd_compras

            items.append({
                "cod_familia": cod_fam,
                "nome_familia": nome_fam,
                "quantidade": qtd,
                "valor_total": val_total,
                "preco_medio": preco_medio,
                "qtd_compras": qtd_compras,
                "ultima_compra": dt_ult,
                "primeira_compra": dt_prim
            })

        ticket_medio = (total_faturamento / total_quantidade) if total_quantidade > 0 else 0.0

        return {
            "cliente": cliente_info,
            "termo_pesquisado": raw_search or "",
            "total_familias": len(items),
            "total_quantidade": total_quantidade,
            "total_faturamento": total_faturamento,
            "total_transacoes": total_compras,
            "ticket_medio_peca": ticket_medio,
            "items": items
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao buscar itens comprados pelo cliente {cod_pessoa}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/clientes/{cod_pessoa}/familias/{cod_familia}/ordens-servico")
def get_cliente_familia_ordens_servico(
    cod_pessoa: int,
    cod_familia: int,
    nome_familia: Optional[str] = Query(None),
    tipo_operacao: Optional[str] = Query(None),
    data_inicio: Optional[str] = Query(None),
    data_fim: Optional[str] = Query(None),
    limit: int = Query(1500, ge=1, le=5000)
):
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # 1. Informações cadastrais do cliente
        cur.execute("""
            SELECT COD_PESSOA, 
                   COALESCE(NULLIF(TRIM(NOME), ''), NULLIF(TRIM(RAZAOSOCIAL), ''), 'Cliente ' || COD_PESSOA) AS NOME_FANTASIA,
                   COALESCE(NULLIF(TRIM(RAZAOSOCIAL), ''), '') AS RAZAO_SOCIAL,
                   COALESCE(NULLIF(TRIM(CIDADE), ''), 'NÃO INFORMADA') AS CIDADE,
                   COALESCE(CNPJ, CPF, '') AS DOCUMENTO
            FROM PESSOA
            WHERE COD_PESSOA = ?
        """, (cod_pessoa,))
        c_row = cur.fetchone()
        cliente_info = {
            "cod_pessoa": cod_pessoa,
            "nome_fantasia": c_row[1].strip() if c_row and c_row[1] else f"Cliente {cod_pessoa}",
            "nome_cliente": c_row[1].strip() if c_row and c_row[1] else f"Cliente {cod_pessoa}",
            "razao_social": c_row[2].strip() if c_row and c_row[2] else "",
            "cidade": c_row[3].strip() if c_row and c_row[3] else "NÃO INFORMADA",
            "documento": c_row[4].strip() if c_row and c_row[4] else ""
        }

        # 2. Filtros de Operação e Datas
        tipos_op_clean = []
        is_explicit_todos = False
        if tipo_operacao and not hasattr(tipo_operacao, 'default'):
            tp_str = str(tipo_operacao).strip()
            if tp_str.lower() == 'todos':
                is_explicit_todos = True
            elif tp_str:
                for part in tp_str.split(','):
                    part_clean = part.strip()
                    if part_clean.isdigit():
                        tipos_op_clean.append(int(part_clean))

        if not tipos_op_clean and not is_explicit_todos:
            tipos_op_clean = [1, 8, 9, 10, 11, 12]

        dt_ini = sanitize_date_param(data_inicio)
        dt_fim = sanitize_date_param(data_fim)
        limit_val = 1500
        if limit is not None and not hasattr(limit, 'default'):
            try:
                limit_val = int(limit)
            except (ValueError, TypeError):
                limit_val = 1500

        first_clause = f"FIRST {limit_val}" if limit_val > 0 else ""

        sql = f"""
            SELECT {first_clause}
                t.COD_TRANSACAO,
                t.COD_EMPRESA,
                COALESCE(os.NUMEROORDEMSERVICO, t.COD_TRANSACAO) AS NUMERO_OS,
                t.DATAEMISSAO,
                ti.COD_TRANSACAOITEM,
                ti.COD_ITEM,
                COALESCE(NULLIF(TRIM(i.DESCRICAO), ''), ti.COD_ITEM) AS NOME_ITEM,
                COALESCE(ti.COD_PRODUTOFAMILIA, prod.COD_PRODUTOFAMILIA, 0) AS COD_FAMILIA,
                COALESCE(NULLIF(TRIM(pf1.DESCRICAO), ''), NULLIF(TRIM(pf2.DESCRICAO), ''), 'Família ' || COALESCE(ti.COD_PRODUTOFAMILIA, prod.COD_PRODUTOFAMILIA, 0)) AS NOME_FAMILIA,
                ti.QUANTIDADE,
                ti.VALORUNITARIO,
                ti.TOTAL,
                COALESCE(ti.VALORDESCONTO, 0) AS VALORDESCONTO,
                t.COD_NATUREZAOPERACAO,
                COALESCE(NULLIF(TRIM(nat.DESCRICAO), ''), '') AS NATUREZA_DESCRICAO,
                nat.TIPO AS TIPO_OPERACAO
            FROM TRANSACAO t
            JOIN TRANSACAO_ITEM ti ON ti.COD_TRANSACAO = t.COD_TRANSACAO AND ti.COD_EMPRESA = t.COD_EMPRESA
            LEFT JOIN ORDEMSERVICO os ON os.COD_ORDEMSERVICO = t.COD_TRANSACAO AND os.COD_EMPRESA = t.COD_EMPRESA
            LEFT JOIN ITEM i ON i.COD_ITEM = ti.COD_ITEM
            LEFT JOIN PRODUTO prod ON prod.COD_PRODUTO = ti.COD_ITEM
            LEFT JOIN PRODUTOFAMILIA pf1 ON pf1.COD_PRODUTOFAMILIA = ti.COD_PRODUTOFAMILIA
            LEFT JOIN PRODUTOFAMILIA pf2 ON pf2.COD_PRODUTOFAMILIA = prod.COD_PRODUTOFAMILIA
            LEFT JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = t.COD_NATUREZAOPERACAO
            WHERE t.SITUACAO = 3
              AND (ti.FATURADO IS NULL OR ti.FATURADO IN ('T', 'S'))
              AND t.COD_PESSOA = ?
        """
        params = [cod_pessoa]

        if cod_familia > 0:
            sql += " AND COALESCE(ti.COD_PRODUTOFAMILIA, prod.COD_PRODUTOFAMILIA, 0) = ?"
            params.append(cod_familia)
        elif cod_familia == 0 and (not nome_familia or 'sem fam' in (nome_familia or '').lower()):
            sql += " AND COALESCE(ti.COD_PRODUTOFAMILIA, prod.COD_PRODUTOFAMILIA, 0) = 0"
        elif nome_familia and nome_familia.strip():
            n_clean = nome_familia.strip().upper()
            sql += " AND (UPPER(pf1.DESCRICAO) LIKE ? OR UPPER(pf2.DESCRICAO) LIKE ? OR UPPER(i.DESCRICAO) LIKE ? OR ti.COD_ITEM = ?)"
            params.extend([f"%{n_clean}%", f"%{n_clean}%", f"%{n_clean}%", n_clean])

        if tipos_op_clean:
            if len(tipos_op_clean) == 1:
                sql += " AND nat.TIPO = ?"
                params.append(tipos_op_clean[0])
            else:
                ph_nat = ', '.join(['?'] * len(tipos_op_clean))
                sql += f" AND nat.TIPO IN ({ph_nat})"
                params.extend(tipos_op_clean)

        if dt_ini:
            sql += " AND t.DATAEMISSAO >= ?"
            params.append(dt_ini)

        if dt_fim:
            sql += " AND t.DATAEMISSAO <= ?"
            params.append(dt_fim)

        sql += """
            ORDER BY t.DATAEMISSAO DESC, t.COD_TRANSACAO DESC, ti.COD_TRANSACAOITEM ASC
        """

        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        conn.close()

        items = []
        total_quantidade = 0.0
        total_faturamento = 0.0
        distinct_os = set()
        resolved_nome_familia = nome_familia or ""

        for r in rows:
            cod_transacao = r[0]
            cod_empresa = r[1]
            numero_os = r[2]
            dt_emissao = r[3].strftime('%Y-%m-%d') if r[3] else ""
            cod_transacao_item = r[4]
            cod_item = r[5].strip() if r[5] else ""
            nome_item = r[6].strip() if r[6] else cod_item
            row_cod_fam = r[7]
            row_nome_fam = r[8].strip() if r[8] else ""
            if not resolved_nome_familia and row_nome_fam:
                resolved_nome_familia = row_nome_fam

            qtd = float(r[9]) if r[9] is not None else 0.0
            unit = float(r[10]) if r[10] is not None else 0.0
            val_total = float(r[11]) if r[11] is not None else 0.0
            desc = float(r[12]) if r[12] is not None else 0.0
            cod_nat = r[13].strip() if r[13] else ""
            nat_desc = r[14].strip() if r[14] else ""
            tipo_op = r[15]

            total_quantidade += qtd
            total_faturamento += val_total
            distinct_os.add(numero_os)

            items.append({
                "cod_transacao": cod_transacao,
                "cod_empresa": cod_empresa,
                "numero_os": numero_os,
                "data_emissao": dt_emissao,
                "cod_transacaoitem": cod_transacao_item,
                "cod_item": cod_item,
                "nome_item": nome_item,
                "cod_familia": row_cod_fam,
                "nome_familia": row_nome_fam,
                "quantidade": qtd,
                "valor_unitario": unit,
                "total": val_total,
                "valor_desconto": desc,
                "cod_naturezaoperacao": cod_nat,
                "natureza_descricao": nat_desc,
                "tipo_operacao": tipo_op
            })

        preco_medio = (total_faturamento / total_quantidade) if total_quantidade > 0 else 0.0

        return {
            "cliente": cliente_info,
            "cod_familia": cod_familia,
            "nome_familia": resolved_nome_familia or f"Família {cod_familia}",
            "total_itens": len(items),
            "total_ordens_servico": len(distinct_os),
            "total_quantidade": total_quantidade,
            "total_faturamento": total_faturamento,
            "ticket_medio_peca": preco_medio,
            "items": items
        }
    except Exception as e:
        logger.error(f"Erro ao buscar ordens de serviço da família {cod_familia} para o cliente {cod_pessoa}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

STOP_WORDS_PT = {'DE', 'DA', 'DO', 'DOS', 'DAS', 'E'}

def clean_patient_tokens(text):
    if not text:
        return []
    text = unicodedata.normalize('NFKD', str(text)).encode('ASCII', 'ignore').decode('ASCII')
    text = re.sub(r'[^a-zA-Z0-9\s]', ' ', text)
    tokens = [w for w in text.upper().split() if w not in STOP_WORDS_PT]
    return tokens

def clean_frame_tokens(text):
    if not text:
        return ""
    text = unicodedata.normalize('NFKD', str(text)).encode('ASCII', 'ignore').decode('ASCII')
    text = re.sub(r'[^a-zA-Z0-9]', '', text).upper()
    return text

def calc_patient_similarity(n1, n2):
    t1 = clean_patient_tokens(n1)
    t2 = clean_patient_tokens(n2)
    if not t1 and not t2:
        return 1.0, "Ambas sem paciente informado"
    if not t1 or not t2:
        return 0.0, "Paciente informado em apenas uma das OSs"
    s1 = ' '.join(t1)
    s2 = ' '.join(t2)
    if s1 == s2:
        return 1.0, "Nomes idênticos"
    set1, set2 = set(t1), set(t2)
    if set1 == set2:
        return 1.0, "Mesmos nomes em ordem diferente"
    
    first_same = (t1[0] == t2[0])
    ratio = SequenceMatcher(None, s1, s2).ratio()
    if not first_same and SequenceMatcher(None, t1[0], t2[0]).ratio() < 0.70:
        ratio = ratio * 0.70
    return round(ratio, 4), f"Similaridade gráfica ({round(ratio*100, 1)}%)"



@app.get("/api/vta/analise")
def get_vta_analise(
    data_inicio: Optional[str] = Query(None, description="Data inicial YYYY-MM-DD"),
    data_fim: Optional[str] = Query(None, description="Data final YYYY-MM-DD"),
    cliente: Optional[str] = Query(None, description="Nome Fantasia, Razão Social ou código do cliente"),
    somente_suspeitas: bool = Query(False, description="Exibir apenas clientes e OSs com similaridade detectada"),
    limit: Optional[str] = Query("0", description="0 = sem limite seguro")
):
    """
    Busca ordens de serviço marcadas como VTA (por Tipo VT = 1 ou Item 15889),
    agrupadas por cliente, e analisa similaridades (mesmo dia, mesmo valor e/ou mesmo paciente).
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        dt_ini = sanitize_date_param(data_inicio)
        dt_fim = sanitize_date_param(data_fim)

        if dt_ini and dt_fim and dt_ini > dt_fim:
            dt_ini, dt_fim = dt_fim, dt_ini

        limit_val = 0
        try:
            if limit is not None and str(limit).strip().isdigit():
                limit_val = int(limit)
        except Exception:
            limit_val = 0
        first_clause = f"FIRST {limit_val}" if limit_val > 0 else ""

        sql = f"""
            SELECT {first_clause}
                os.COD_ORDEMSERVICO,
                os.NUMEROORDEMSERVICO,
                os.COD_EMPRESA,
                t.DATAEMISSAO,
                s.DATAEXPEDICAO,
                t.COD_PESSOA,
                COALESCE(NULLIF(TRIM(p.NOME), ''), NULLIF(TRIM(p.RAZAOSOCIAL), ''), 'Cliente ' || t.COD_PESSOA) AS CLIENTE_NOME_FANTASIA,
                CAST(SUBSTRING(p.RAZAOSOCIAL FROM 1 FOR 250) AS VARCHAR(250)) AS CLIENTE_RAZAO_SOCIAL,
                CAST(SUBSTRING(p.CNPJ FROM 1 FOR 25) AS VARCHAR(25)) AS CNPJ,
                CAST(SUBSTRING(p.CPF FROM 1 FOR 25) AS VARCHAR(25)) AS CPF,
                CAST(SUBSTRING(p.CIDADE FROM 1 FOR 60) AS VARCHAR(60)) AS CIDADE,
                CAST(SUBSTRING(p.COD_UF FROM 1 FOR 5) AS VARCHAR(5)) AS UF,
                p.IDENTIFICADOR,
                t.TOTAL,
                t.TOTALPRODUTOS,
                t.TOTALSERVICOS,
                COALESCE(s.VALORDESCONTO, 0) AS DESCONTO_OS,
                CAST(SUBSTRING(sit.DESCRICAO FROM 1 FOR 60) AS VARCHAR(60)) AS SITUACAO_OS,
                CAST(SUBSTRING(t.OBSERVACAO FROM 1 FOR 500) AS VARCHAR(500)) AS OBSERVACAO,
                o.TIPOVT,
                CAST(SUBSTRING(o.NOMEPACIENTE FROM 1 FOR 120) AS VARCHAR(120)) AS NOMEPACIENTE,
                CAST(SUBSTRING(o.REFERENCIA FROM 1 FOR 50) AS VARCHAR(50)) AS REFERENCIA,
                CAST(SUBSTRING(o.DESCRICAOARMACAO FROM 1 FOR 80) AS VARCHAR(80)) AS DESCRICAOARMACAO,
                CASE WHEN EXISTS (SELECT 1 FROM TRANSACAO_ITEM ti WHERE ti.COD_TRANSACAO = os.COD_ORDEMSERVICO AND ti.COD_EMPRESA = os.COD_EMPRESA AND ti.COD_ITEM = '15889') THEN 1 ELSE 0 END AS TEM_ITEM_VTA
            FROM ORDEMSERVICO os
            JOIN TRANSACAO t ON t.COD_TRANSACAO = os.COD_ORDEMSERVICO AND t.COD_EMPRESA = os.COD_EMPRESA
            LEFT JOIN SAIDA s ON s.COD_SAIDA = os.COD_ORDEMSERVICO AND s.COD_EMPRESA = os.COD_EMPRESA
            LEFT JOIN PESSOA p ON p.COD_PESSOA = t.COD_PESSOA
            LEFT JOIN ORDEMSERVICOSITUACAO sit ON sit.COD_ORDEMSERVICOSITUACAO = os.COD_ORDEMSERVICOSITUACAO
            LEFT JOIN OTIORDEMSERVICOOTICA o ON o.COD_ORDEMSERVICOOTICA = os.COD_ORDEMSERVICO AND o.COD_EMPRESA = os.COD_EMPRESA
            WHERE (COALESCE(o.TIPOVT, 0) = 1 OR EXISTS (SELECT 1 FROM TRANSACAO_ITEM ti WHERE ti.COD_TRANSACAO = os.COD_ORDEMSERVICO AND ti.COD_EMPRESA = os.COD_EMPRESA AND ti.COD_ITEM = '15889'))
        """

        params = []
        if dt_ini:
            sql += " AND t.DATAEMISSAO >= ?"
            params.append(dt_ini)
        if dt_fim:
            sql += " AND t.DATAEMISSAO <= ?"
            params.append(dt_fim)

        client_clean = str(cliente).strip() if cliente and not hasattr(cliente, 'default') and str(cliente).strip() else None
        if client_clean:
            if client_clean.isdigit():
                sql += " AND (p.COD_PESSOA = ? OR p.IDENTIFICADOR = ? OR UPPER(p.NOME) LIKE UPPER(?) OR UPPER(p.RAZAOSOCIAL) LIKE UPPER(?))"
                c_param = f"%{client_clean}%"
                params.extend([int(client_clean), int(client_clean), c_param, c_param])
            else:
                sql += " AND (UPPER(p.NOME) LIKE UPPER(?) OR UPPER(p.RAZAOSOCIAL) LIKE UPPER(?))"
                c_param = f"%{client_clean}%"
                params.extend([c_param, c_param])

        sql += " ORDER BY p.NOME ASC, t.DATAEMISSAO DESC, os.COD_ORDEMSERVICO DESC"

        cur.execute(sql, tuple(params))
        header_rows = cur.fetchall()

        if not header_rows:
            conn.close()
            return {
                "filtros": {
                    "data_inicio": dt_ini,
                    "data_fim": dt_fim,
                    "cliente": client_clean,
                    "somente_suspeitas": somente_suspeitas
                },
                "totais": {
                    "total_clientes": 0,
                    "total_os": 0,
                    "total_faturamento": 0.0,
                    "total_suspeitas": 0,
                    "total_os_suspeitas": 0,
                    "total_clientes_suspeitos": 0
                },
                "clientes": []
            }

        os_ids = [r[0] for r in header_rows]
        items_by_os = {}

        chunk_size = 400
        for i in range(0, len(os_ids), chunk_size):
            chunk = os_ids[i:i + chunk_size]
            ph = ','.join(['?'] * len(chunk))
            cur.execute(f"""
                SELECT 
                    ti.COD_TRANSACAO,
                    ti.COD_TRANSACAOITEM,
                    ti.COD_ITEM,
                    CAST(ti.DESCRICAO AS VARCHAR(250)),
                    ti.QUANTIDADE,
                    ti.VALORORIGINAL,
                    ti.VALORUNITARIO,
                    ti.TOTAL,
                    ti.VALORDESCONTO,
                    osi.PERCENTUALDESCONTO,
                    i.COD_ITEMTIPO,
                    CAST(pf.DESCRICAO AS VARCHAR(100)) AS FAMILIA_DESCRICAO
                FROM TRANSACAO_ITEM ti
                LEFT JOIN ITEM i ON i.COD_ITEM = ti.COD_ITEM
                LEFT JOIN ORDEMSERVICO_ITEM osi ON osi.COD_TRANSACAO = ti.COD_TRANSACAO AND osi.COD_TRANSACAOITEM = ti.COD_TRANSACAOITEM AND osi.COD_EMPRESA = ti.COD_EMPRESA
                LEFT JOIN PRODUTO prod ON prod.COD_PRODUTO = ti.COD_ITEM
                LEFT JOIN PRODUTOFAMILIA pf ON pf.COD_PRODUTOFAMILIA = COALESCE(ti.COD_PRODUTOFAMILIA, prod.COD_PRODUTOFAMILIA)
                WHERE ti.COD_TRANSACAO IN ({ph})
                ORDER BY ti.COD_TRANSACAO, i.COD_ITEMTIPO, ti.COD_TRANSACAOITEM
            """, tuple(chunk))

            for ir in cur.fetchall():
                cod_transacao = ir[0]
                cod_item = str(ir[2]).strip() if ir[2] else ""
                desc_item = str(ir[3]).strip() if ir[3] else ""
                qtd = float(ir[4]) if ir[4] is not None else 0.0
                v_orig = float(ir[5]) if ir[5] is not None else 0.0
                v_unit = float(ir[6]) if ir[6] is not None else 0.0
                tot = float(ir[7]) if ir[7] is not None else 0.0
                v_desc_item = float(ir[8]) if ir[8] is not None else 0.0
                p_desc_osi = float(ir[9]) if ir[9] is not None else 0.0
                item_tipo = ir[10] if ir[10] is not None else 1
                fam_desc = str(ir[11]).strip() if ir[11] else ""

                v_tabela_total = v_orig * qtd if v_orig > 0 else (tot + v_desc_item)
                if v_orig > v_unit and v_orig > 0:
                    v_desc_tot = ((v_orig - v_unit) * qtd) + v_desc_item
                elif v_desc_item > 0:
                    v_desc_tot = v_desc_item
                elif p_desc_osi > 0:
                    v_desc_tot = (tot / (1.0 - (p_desc_osi / 100.0))) - tot if p_desc_osi < 100 else 0.0
                else:
                    v_desc_tot = 0.0

                v_desc_unit = (v_desc_tot / qtd) if qtd > 0 else 0.0
                p_desc = round((v_desc_tot / v_tabela_total) * 100.0, 1) if v_tabela_total > 0 else (round(p_desc_osi, 1) if p_desc_osi > 0 else 0.0)

                items_by_os.setdefault(cod_transacao, []).append({
                    "cod_item": cod_item,
                    "descricao": desc_item,
                    "quantidade": qtd,
                    "valor_original": round(v_orig, 2),
                    "desconto_unitario": round(v_desc_unit, 2),
                    "desconto_total": round(v_desc_tot, 2),
                    "perc_desconto": p_desc,
                    "valor_unitario": round(v_unit, 2),
                    "total": round(tot, 2),
                    "familia": fam_desc,
                    "is_servico": (item_tipo == 2)
                })

        conn.close()

        # Agrupar OSs por cliente
        clients_dict = {}
        for r in header_rows:
            cod_os = r[0]
            num_os = r[1]
            cod_empresa = r[2]
            dt_emissao = r[3]
            dt_expedicao = r[4]
            cod_pessoa = r[5] or 0
            nome_fantasia = r[6].strip() if r[6] else f"Cliente {cod_pessoa}"
            razao_social = r[7].strip() if r[7] else ""
            cnpj = r[8].strip() if r[8] else ""
            cpf = r[9].strip() if r[9] else ""
            cidade = r[10].strip() if r[10] else ""
            uf = r[11].strip() if r[11] else ""
            identificador = r[12] or cod_pessoa
            total_os = float(r[13]) if r[13] is not None else 0.0
            tot_produtos = float(r[14]) if r[14] is not None else 0.0
            tot_servicos = float(r[15]) if r[15] is not None else 0.0
            desc_os = float(r[16]) if r[16] is not None else 0.0
            situacao = r[17].strip() if r[17] else ""
            obs = r[18].strip() if r[18] else ""
            tipo_vt_val = r[19]
            paciente_val = str(r[20]).strip() if r[20] else ""
            referencia_val = str(r[21]).strip() if r[21] else ""
            armacao_val = str(r[22]).strip() if r[22] else ""
            tem_item_vta = bool(r[23])

            origem_vta = "Marcação VT"
            if tipo_vt_val == 1 and tem_item_vta:
                origem_vta = "VT Marcada e Serviço VTA"
            elif tem_item_vta:
                origem_vta = "Serviço V.T.A. (Item 15889)"

            os_items = items_by_os.get(cod_os, [])
            lentes = [it for it in os_items if not it["is_servico"]]
            servicos = [it for it in os_items if it["is_servico"]]

            os_obj = {
                "cod_ordemservico": cod_os,
                "numeroordemservico": num_os,
                "cod_empresa": cod_empresa,
                "data_emissao": dt_emissao.strftime("%d/%m/%Y") if dt_emissao else "",
                "data_emissao_iso": dt_emissao.strftime("%Y-%m-%d") if dt_emissao else "",
                "data_expedicao": dt_expedicao.strftime("%d/%m/%Y") if dt_expedicao else "",
                "total": round(total_os, 2),
                "total_produtos": round(tot_produtos, 2),
                "total_servicos": round(tot_servicos, 2),
                "desconto_os": round(desc_os, 2),
                "situacao_os": situacao,
                "observacao": obs,
                "tipo_vt": tipo_vt_val,
                "origem_vta": origem_vta,
                "nome_paciente": paciente_val,
                "referencia": referencia_val,
                "descricao_armacao": armacao_val,
                "grau_suspeita": None,
                "similaridades": [],
                "lentes": lentes,
                "servicos": servicos
            }

            if cod_pessoa not in clients_dict:
                clients_dict[cod_pessoa] = {
                    "cod_pessoa": cod_pessoa,
                    "nome_fantasia": nome_fantasia,
                    "razao_social": razao_social,
                    "cnpj": cnpj,
                    "cpf": cpf,
                    "cidade": cidade,
                    "uf": uf,
                    "identificador": identificador,
                    "total_os": 0,
                    "total_faturamento": 0.0,
                    "tem_similaridade": False,
                    "qtd_casos_similaridade": 0,
                    "ordens_servico": [],
                    "casos_similaridade": []
                }

            client_entry = clients_dict[cod_pessoa]
            client_entry["ordens_servico"].append(os_obj)
            client_entry["total_os"] += 1
            client_entry["total_faturamento"] += total_os

        # Análise de similaridade entre pares de OS para cada cliente
        total_casos_suspeitos_geral = 0
        conjunto_os_suspeitas = set()
        clientes_com_suspeitas = 0

        for cod_pessoa, cdata in clients_dict.items():
            os_list = cdata["ordens_servico"]
            casos_cliente = []

            for i in range(len(os_list)):
                for j in range(i + 1, len(os_list)):
                    os1 = os_list[i]
                    os2 = os_list[j]

                    same_date = (os1["data_emissao_iso"] == os2["data_emissao_iso"])
                    same_val = (abs(os1["total"] - os2["total"]) <= 0.05)

                    f1 = clean_frame_tokens(os1.get("descricao_armacao"))
                    f2 = clean_frame_tokens(os2.get("descricao_armacao"))
                    same_frame = (f1 == f2)

                    sim_score, sim_label = calc_patient_similarity(os1["nome_paciente"], os2["nome_paciente"])

                    grau = None
                    motivos = []

                    # Regra de Duplicidade:
                    # 1) Armação ou a falta dela precisa ser igual
                    # 2) Similaridade do paciente >= 98%
                    # 3) Mesmo valor e mesma data de emissão
                    if same_date and same_val and same_frame and sim_score >= 0.98:
                        grau = "alta"
                        armacao_desc = "sem armação" if not f1 else f"armação '{os1['descricao_armacao']}'"
                        motivos.append(
                            f"🔴 POSSÍVEL DUPLICIDADE ({round(sim_score*100)}%): Mesmo dia ({os1['data_emissao']}), mesmo valor (R$ {os1['total']:.2f}), {armacao_desc} e paciente semelhante ({sim_label})"
                        )


                    if grau:
                        caso = {
                            "id": f"{os1['cod_ordemservico']}_{os2['cod_ordemservico']}",
                            "grau": grau,
                            "os1_num": os1["numeroordemservico"],
                            "os1_cod": os1["cod_ordemservico"],
                            "os1_paciente": os1["nome_paciente"],
                            "os1_valor": os1["total"],
                            "os2_num": os2["numeroordemservico"],
                            "os2_cod": os2["cod_ordemservico"],
                            "os2_paciente": os2["nome_paciente"],
                            "os2_valor": os2["total"],
                            "data": os1["data_emissao"],
                            "sim_paciente_score": sim_score,
                            "motivo": "; ".join(motivos)
                        }
                        casos_cliente.append(caso)
                        total_casos_suspeitos_geral += 1
                        conjunto_os_suspeitas.add(os1["cod_ordemservico"])
                        conjunto_os_suspeitas.add(os2["cod_ordemservico"])

                        # Registra na OS 1
                        os1["similaridades"].append({
                            "os_relacionada_num": os2["numeroordemservico"],
                            "os_relacionada_cod": os2["cod_ordemservico"],
                            "outro_paciente": os2["nome_paciente"],
                            "outro_valor": os2["total"],
                            "data": os1["data_emissao"],
                            "grau": grau,
                            "motivo": "; ".join(motivos)
                        })
                        # Registra na OS 2
                        os2["similaridades"].append({
                            "os_relacionada_num": os1["numeroordemservico"],
                            "os_relacionada_cod": os1["cod_ordemservico"],
                            "outro_paciente": os1["nome_paciente"],
                            "outro_valor": os1["total"],
                            "data": os2["data_emissao"],
                            "grau": grau,
                            "motivo": "; ".join(motivos)
                        })

                        # Atualiza prioridade do grau na OS
                        for item_os in (os1, os2):
                            if grau == "alta":
                                item_os["grau_suspeita"] = "alta"
                            elif grau == "media" and item_os["grau_suspeita"] != "alta":
                                item_os["grau_suspeita"] = "media"
                            elif grau == "baixa" and not item_os["grau_suspeita"]:
                                item_os["grau_suspeita"] = "baixa"

            cdata["casos_similaridade"] = casos_cliente
            cdata["qtd_casos_similaridade"] = len(casos_cliente)
            cdata["tem_similaridade"] = len(casos_cliente) > 0
            cdata["total_faturamento"] = round(cdata["total_faturamento"], 2)
            if cdata["tem_similaridade"]:
                clientes_com_suspeitas += 1

        # Lista de clientes ordenada por nome
        clientes_finais = list(clients_dict.values())
        clientes_finais.sort(key=lambda c: (not c["tem_similaridade"], c["nome_fantasia"].upper()))

        # Se solicitado somente casos suspeitos
        if somente_suspeitas:
            clientes_filtrados = []
            for c in clientes_finais:
                if c["tem_similaridade"]:
                    # Mantém apenas as OSs que participam de alguma similaridade
                    c_copia = dict(c)
                    c_copia["ordens_servico"] = [o for o in c["ordens_servico"] if o["grau_suspeita"] is not None]
                    clientes_filtrados.append(c_copia)
            clientes_finais = clientes_filtrados

        total_faturamento_geral = sum(c["total_faturamento"] for c in clients_dict.values())
        total_os_geral = sum(c["total_os"] for c in clients_dict.values())

        return {
            "filtros": {
                "data_inicio": dt_ini,
                "data_fim": dt_fim,
                "cliente": client_clean,
                "somente_suspeitas": somente_suspeitas
            },
            "totais": {
                "total_clientes": len(clients_dict),
                "total_os": total_os_geral,
                "total_faturamento": round(total_faturamento_geral, 2),
                "total_suspeitas": total_casos_suspeitos_geral,
                "total_os_suspeitas": len(conjunto_os_suspeitas),
                "total_clientes_suspeitos": clientes_com_suspeitas
            },
            "clientes": clientes_finais
        }
    except Exception as e:
        logger.error(f"Erro ao buscar análise de VTA: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dashboard/vendas-curva")
def get_dashboard_vendas_curva(
    ano_base: Optional[int] = Query(None, description="Ano base de referência (padrão ano atual)"),
    qtd_anos: int = Query(3, ge=1, le=10, description="Quantidade de anos comparativos"),
    tipo_filtro: str = Query("vendas", description="'vendas', 'amplo' ou 'todos'"),
    apenas_faturadas: bool = Query(True, description="Se True, filtra t.SITUACAO = 3")
):
    """
    Retorna métricas mensais consolidadas para curva de vendas dos últimos N anos
    e dados do ano corrente com linha de tendência estatística (regressão linear OLS).
    """
    try:
        hoje = datetime.date.today()
        ano_atual = hoje.year
        mes_atual = hoje.month
        dia_atual = hoje.day

        ano_ref = int(ano_base) if ano_base and not hasattr(ano_base, 'default') and int(ano_base) > 2000 else ano_atual
        qtd = max(1, min(10, int(qtd_anos))) if qtd_anos and not hasattr(qtd_anos, 'default') else 3
        
        anos = [ano_ref - i for i in range(qtd - 1, -1, -1)]
        min_ano = min(anos)

        conn = get_db_connection()
        cur = conn.cursor()

        where_clauses = [
            "t.DATAEMISSAO >= ?",
            "t.DATAEMISSAO <= ?"
        ]
        params = [f"{min_ano}-01-01", f"{ano_ref}-12-31"]

        if apenas_faturadas:
            where_clauses.append("t.SITUACAO = 3")

        tipo_clean = str(tipo_filtro).strip().lower() if tipo_filtro and not hasattr(tipo_filtro, 'default') else "vendas"
        if tipo_clean == "vendas":
            where_clauses.append("(nat.TIPO IN (1, 11) OR nat.TIPO IS NULL)")
        elif tipo_clean == "amplo":
            where_clauses.append("(nat.TIPO IN (1, 8, 9, 10, 11, 12) OR nat.TIPO IS NULL)")

        where_str = " AND ".join(where_clauses)

        sql = f"""
            SELECT 
                EXTRACT(YEAR FROM t.DATAEMISSAO) AS ANO,
                EXTRACT(MONTH FROM t.DATAEMISSAO) AS MES,
                COUNT(os.COD_ORDEMSERVICO) AS QTD_OS,
                SUM(t.TOTAL) AS TOTAL_VALOR,
                SUM(COALESCE(s.VALORDESCONTO, 0)) AS TOTAL_DESCONTO,
                AVG(t.TOTAL) AS TICKET_MEDIO
            FROM ORDEMSERVICO os
            JOIN SAIDA s ON s.COD_SAIDA = os.COD_ORDEMSERVICO AND s.COD_EMPRESA = os.COD_EMPRESA
            JOIN TRANSACAO t ON t.COD_TRANSACAO = s.COD_SAIDA AND t.COD_EMPRESA = os.COD_EMPRESA
            LEFT JOIN NATUREZAOPERACAO nat ON nat.COD_NATUREZAOPERACAO = t.COD_NATUREZAOPERACAO
            WHERE {where_str}
            GROUP BY EXTRACT(YEAR FROM t.DATAEMISSAO), EXTRACT(MONTH FROM t.DATAEMISSAO)
            ORDER BY ANO, MES
        """

        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        conn.close()

        lookup = {}
        for r in rows:
            ano = int(r[0])
            mes = int(r[1])
            qtd_os = int(r[2]) if r[2] is not None else 0
            val_total = float(r[3]) if r[3] is not None else 0.0
            val_desc = float(r[4]) if r[4] is not None else 0.0
            ticket = float(r[5]) if r[5] is not None else (val_total / qtd_os if qtd_os > 0 else 0.0)
            lookup[(ano, mes)] = {
                "quantidade": qtd_os,
                "valor": val_total,
                "desconto": val_desc,
                "ticket_medio": ticket
            }

        meses_nomes = [
            (1, "Janeiro", "Jan"), (2, "Fevereiro", "Fev"), (3, "Março", "Mar"),
            (4, "Abril", "Abr"), (5, "Maio", "Mai"), (6, "Junho", "Jun"),
            (7, "Julho", "Jul"), (8, "Agosto", "Ago"), (9, "Setembro", "Set"),
            (10, "Outubro", "Out"), (11, "Novembro", "Nov"), (12, "Dezembro", "Dez")
        ]

        mensal_por_ano = {}
        totais_por_ano = {}

        for a in anos:
            lista_meses = []
            soma_val = 0.0
            soma_qtd = 0
            soma_desc = 0.0

            for m_num, m_nome, m_abrev in meses_nomes:
                rec = lookup.get((a, m_num), {})
                v = round(rec.get("valor", 0.0), 2)
                q = rec.get("quantidade", 0)
                d = round(rec.get("desconto", 0.0), 2)
                t = round(rec.get("ticket_medio", 0.0), 2) if q > 0 else (round(v / q, 2) if q > 0 else 0.0)

                soma_val += v
                soma_qtd += q
                soma_desc += d

                is_corrente = (a == ano_atual and m_num == mes_atual)
                is_futuro = (a > ano_atual) or (a == ano_atual and m_num > mes_atual)

                lista_meses.append({
                    "mes": m_num,
                    "nome": m_nome,
                    "abrev": m_abrev,
                    "valor": v,
                    "quantidade": q,
                    "desconto": d,
                    "ticket_medio": t,
                    "is_corrente": is_corrente,
                    "is_futuro": is_futuro
                })

            mensal_por_ano[str(a)] = lista_meses
            totais_por_ano[str(a)] = {
                "valor_total": round(soma_val, 2),
                "quantidade_total": soma_qtd,
                "desconto_total": round(soma_desc, 2),
                "ticket_medio": round(soma_val / soma_qtd, 2) if soma_qtd > 0 else 0.0
            }

        # 1. Regressão Linear Simples (OLS) para Linha de Tendência do Ano Base
        meses_ano_base = mensal_por_ano.get(str(ano_ref), [])
        
        # Determina até qual mês calcular a linha de tendência
        limite_mes_calc = mes_atual if ano_ref == ano_atual else 12
        
        # Pontos (X, Y) para regressão de valor e de quantidade
        X = []
        Y_val = []
        Y_qtd = []

        dias_no_mes_atual = calendar.monthrange(ano_ref, mes_atual)[1] if ano_ref == ano_atual else 30
        prorata_fator = (dias_no_mes_atual / max(1, dia_atual)) if (ano_ref == ano_atual and dia_atual < dias_no_mes_atual) else 1.0

        for m_data in meses_ano_base:
            m_idx = m_data["mes"]
            if m_idx <= limite_mes_calc:
                val = m_data["valor"]
                qtd_m = m_data["quantidade"]
                # Se for o mês corrente em andamento, anualiza pró-rata para não puxar a reta para baixo
                if m_data["is_corrente"] and prorata_fator > 1.0:
                    val = val * prorata_fator
                    qtd_m = int(round(qtd_m * prorata_fator))
                
                if val > 0 or qtd_m > 0:
                    X.append(m_idx)
                    Y_val.append(val)
                    Y_qtd.append(qtd_m)

        def calc_ols(x_list, y_list):
            k = len(x_list)
            if k < 2:
                mean_y = (y_list[0] if y_list else 0.0)
                return 0.0, mean_y
            sx = sum(x_list)
            sy = sum(y_list)
            sxy = sum(x * y for x, y in zip(x_list, y_list))
            sxx = sum(x * x for x in x_list)
            denom = (k * sxx - sx * sx)
            if denom == 0:
                return 0.0, (sy / k)
            slope = (k * sxy - sx * sy) / denom
            intercept = (sy - slope * sx) / k
            return slope, intercept

        slope_val, intercept_val = calc_ols(X, Y_val)
        slope_qtd, intercept_qtd = calc_ols(X, Y_qtd)

        tendencia_12_meses_valor = [round(max(0.0, slope_val * m + intercept_val), 2) for m in range(1, 13)]
        tendencia_12_meses_qtd = [int(round(max(0.0, slope_qtd * m + intercept_qtd))) for m in range(1, 13)]

        # Taxa de inclinação mensal percentual
        media_val = (sum(Y_val) / len(Y_val)) if Y_val else 1.0
        taxa_crescimento_mensal_val = round((slope_val / media_val) * 100, 2) if media_val > 0 else 0.0

        # 2. Cálculos de KPIs
        tot_ref = totais_por_ano.get(str(ano_ref), {})
        fat_ano_ref = tot_ref.get("valor_total", 0.0)
        qtd_ano_ref = tot_ref.get("quantidade_total", 0)
        ticket_ano_ref = tot_ref.get("ticket_medio", 0.0)

        # Ano anterior
        ano_anterior = ano_ref - 1
        tot_ant = totais_por_ano.get(str(ano_anterior), {})
        fat_ano_ant_fechado = tot_ant.get("valor_total", 0.0)
        qtd_ano_ant_fechado = tot_ant.get("quantidade_total", 0)

        # Mesmo período do ano anterior (até mês atual)
        meses_ant = mensal_por_ano.get(str(ano_anterior), [])
        fat_ano_ant_periodo = sum(m["valor"] for m in meses_ant if m["mes"] <= limite_mes_calc)
        qtd_ano_ant_periodo = sum(m["quantidade"] for m in meses_ant if m["mes"] <= limite_mes_calc)

        yoy_val_pct = round(((fat_ano_ref / fat_ano_ant_periodo) - 1.0) * 100, 1) if fat_ano_ant_periodo > 0 else 0.0
        yoy_qtd_pct = round(((qtd_ano_ref / qtd_ano_ant_periodo) - 1.0) * 100, 1) if qtd_ano_ant_periodo > 0 else 0.0

        # Melhor mês do ano base
        melhor_mes = max(meses_ano_base, key=lambda x: x["valor"]) if meses_ano_base else {}

        # Mês atual (em andamento)
        mes_atual_obj = next((m for m in meses_ano_base if m["is_corrente"]), None)
        mes_atual_info = None
        if mes_atual_obj:
            val_real = mes_atual_obj["valor"]
            qtd_real = mes_atual_obj["quantidade"]
            val_proj = round(val_real * prorata_fator, 2)
            qtd_proj = int(round(qtd_real * prorata_fator))
            mes_atual_info = {
                "mes": mes_atual_obj["mes"],
                "nome": mes_atual_obj["nome"],
                "abrev": mes_atual_obj["abrev"],
                "dias_corridos": dia_atual,
                "dias_totais": dias_no_mes_atual,
                "prorata_fator": round(prorata_fator, 2),
                "valor_realizado": val_real,
                "valor_projetado": val_proj,
                "quantidade_realizada": qtd_real,
                "quantidade_projetada": qtd_proj
            }

        # Projeção de fechamento do ano
        if ano_ref == ano_atual:
            soma_fechados = sum(m["valor"] for m in meses_ano_base if m["mes"] < mes_atual)
            soma_mes_atual_proj = mes_atual_info["valor_projetado"] if mes_atual_info else 0.0
            soma_futuros_trend = sum(tendencia_12_meses_valor[m_idx - 1] for m_idx in range(mes_atual + 1, 13))
            projecao_fechamento_ano = round(soma_fechados + soma_mes_atual_proj + soma_futuros_trend, 2)
        else:
            projecao_fechamento_ano = fat_ano_ref

        return {
            "anos": anos,
            "ano_base": ano_ref,
            "ano_atual": ano_atual,
            "mes_atual": mes_atual,
            "dia_atual": dia_atual,
            "tipo_filtro": tipo_clean,
            "apenas_faturadas": apenas_faturadas,
            "mensal_por_ano": mensal_por_ano,
            "totais_por_ano": totais_por_ano,
            "tendencia_ano_base": {
                "slope_valor": round(slope_val, 2),
                "intercept_valor": round(intercept_val, 2),
                "taxa_crescimento_mensal": taxa_crescimento_mensal_val,
                "valores_12_meses": tendencia_12_meses_valor,
                "quantidades_12_meses": tendencia_12_meses_qtd
            },
            "kpis": {
                "faturamento_ano_base": fat_ano_ref,
                "quantidade_ano_base": qtd_ano_ref,
                "ticket_medio_ano_base": ticket_ano_ref,
                "faturamento_ano_anterior_periodo": fat_ano_ant_periodo,
                "quantidade_ano_anterior_periodo": qtd_ano_ant_periodo,
                "faturamento_ano_anterior_fechado": fat_ano_ant_fechado,
                "quantidade_ano_anterior_fechado": qtd_ano_ant_fechado,
                "yoy_faturamento_pct": yoy_val_pct,
                "yoy_quantidade_pct": yoy_qtd_pct,
                "melhor_mes": melhor_mes,
                "mes_atual_info": mes_atual_info,
                "projecao_fechamento_ano": projecao_fechamento_ano
            }
        }
    except Exception as e:
        logger.error(f"Erro ao gerar dados do dashboard de curva de vendas: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dashboard/financeiro-curva")
def get_dashboard_financeiro_curva(
    ano_base: Optional[int] = Query(None, description="Ano base de referência (padrão ano atual)"),
    qtd_anos: int = Query(3, ge=1, le=10, description="Quantidade de anos comparativos"),
    regime: str = Query("vencimento", description="'vencimento' ou 'liquidacao'"),
    situacao: str = Query("todos", description="'todos', 'liquidados' ou 'abertos'")
):
    """
    Retorna métricas mensais comparativas de Contas a Pagar e Contas a Receber,
    cálculo do Ponto de Equilíbrio mensal, saldo líquido operacional (Receber - Pagar),
    índice de cobertura e linhas de tendência estatística (OLS).
    """
    try:
        hoje = datetime.date.today()
        ano_atual = hoje.year
        mes_atual = hoje.month
        dia_atual = hoje.day

        ano_ref = int(ano_base) if ano_base and not hasattr(ano_base, 'default') and int(ano_base) > 2000 else ano_atual
        qtd = max(1, min(10, int(qtd_anos))) if qtd_anos and not hasattr(qtd_anos, 'default') else 3
        
        anos = [ano_ref - i for i in range(qtd - 1, -1, -1)]
        min_ano = min(anos)

        regime_clean = str(regime).strip().lower() if regime and not hasattr(regime, 'default') else "vencimento"
        situacao_clean = str(situacao).strip().lower() if situacao and not hasattr(situacao, 'default') else "todos"

        conn = get_db_connection()
        cur = conn.cursor()

        # Definição do campo de data conforme o regime selecionado
        if regime_clean == "liquidacao":
            date_expr = "(CASE WHEN l.PAGAR = 'T' THEN COALESCE(p.DATAPAGAMENTO, p.DATAVENCIMENTO) ELSE COALESCE(p.DATARECEBIMENTO, p.DATAVENCIMENTO) END)"
        else:
            date_expr = "p.DATAVENCIMENTO"

        where_clauses = [
            f"{date_expr} >= ?",
            f"{date_expr} <= ?"
        ]
        params = [f"{min_ano}-01-01", f"{ano_ref}-12-31"]

        if situacao_clean == "liquidados":
            where_clauses.append("p.SITUACAO = 3")
        elif situacao_clean == "abertos":
            where_clauses.append("p.SITUACAO = 1")

        where_str = " AND ".join(where_clauses)

        sql = f"""
            SELECT 
                EXTRACT(YEAR FROM {date_expr}) AS ANO,
                EXTRACT(MONTH FROM {date_expr}) AS MES,
                l.PAGAR,
                COUNT(p.COD_LANCAMENTOPARCELA) AS QTD,
                SUM(p.VALOR) AS TOTAL_VALOR,
                SUM(COALESCE(p.VALORPAGO, 0) + COALESCE(p.VALORRECEBIDO, 0)) AS TOTAL_LIQUIDADO,
                SUM(CASE WHEN p.SITUACAO = 1 THEN p.VALOR ELSE 0 END) AS TOTAL_ABERTO
            FROM FINLANCAMENTO l
            JOIN FINLANCAMENTOPARCELA p ON p.COD_LANCAMENTO = l.COD_LANCAMENTO
            WHERE {where_str}
            GROUP BY EXTRACT(YEAR FROM {date_expr}), EXTRACT(MONTH FROM {date_expr}), l.PAGAR
            ORDER BY ANO, MES, l.PAGAR
        """

        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        conn.close()

        lookup = {}
        for r in rows:
            ano = int(r[0])
            mes = int(r[1])
            is_pagar = (r[2] == 'T')
            tipo_chave = 'pagar' if is_pagar else 'receber'
            qtd_t = int(r[3]) if r[3] is not None else 0
            val_total = float(r[4]) if r[4] is not None else 0.0
            val_liq = float(r[5]) if r[5] is not None else 0.0
            val_aberto = float(r[6]) if r[6] is not None else 0.0
            ticket = (val_total / qtd_t) if qtd_t > 0 else 0.0

            lookup[(ano, mes, tipo_chave)] = {
                "quantidade": qtd_t,
                "valor": val_total,
                "liquidado": val_liq,
                "aberto": val_aberto,
                "ticket_medio": round(ticket, 2)
            }

        meses_nomes = [
            (1, "Janeiro", "Jan"), (2, "Fevereiro", "Fev"), (3, "Março", "Mar"),
            (4, "Abril", "Abr"), (5, "Maio", "Mai"), (6, "Junho", "Jun"),
            (7, "Julho", "Jul"), (8, "Agosto", "Ago"), (9, "Setembro", "Set"),
            (10, "Outubro", "Out"), (11, "Novembro", "Nov"), (12, "Dezembro", "Dez")
        ]

        mensal_por_ano = {}
        totais_por_ano = {}

        for a in anos:
            lista_meses = []
            soma_rec = 0.0
            soma_pag = 0.0
            soma_rec_qtd = 0
            soma_pag_qtd = 0
            soma_rec_aberto = 0.0
            soma_pag_aberto = 0.0

            for m_num, m_nome, m_abrev in meses_nomes:
                rec_info = lookup.get((a, m_num, 'receber'), {})
                pag_info = lookup.get((a, m_num, 'pagar'), {})

                rec_val = round(rec_info.get("valor", 0.0), 2)
                pag_val = round(pag_info.get("valor", 0.0), 2)

                rec_q = rec_info.get("quantidade", 0)
                pag_q = pag_info.get("quantidade", 0)

                rec_ab = round(rec_info.get("aberto", 0.0), 2)
                pag_ab = round(pag_info.get("aberto", 0.0), 2)

                rec_liq = round(rec_info.get("liquidado", 0.0), 2)
                pag_liq = round(pag_info.get("liquidado", 0.0), 2)

                soma_rec += rec_val
                soma_pag += pag_val
                soma_rec_qtd += rec_q
                soma_pag_qtd += pag_q
                soma_rec_aberto += rec_ab
                soma_pag_aberto += pag_ab

                saldo_liq = round(rec_val - pag_val, 2)
                ponto_equilibrio = pag_val
                indice_cob = round((rec_val / pag_val) * 100, 1) if pag_val > 0 else (100.0 if rec_val > 0 else 0.0)
                status_mes = "Superávit" if saldo_liq >= 0 else "Déficit"

                is_corrente = (a == ano_atual and m_num == mes_atual)
                is_futuro = (a > ano_atual) or (a == ano_atual and m_num > mes_atual)

                lista_meses.append({
                    "mes": m_num,
                    "nome": m_nome,
                    "abrev": m_abrev,
                    "receber": {
                        "valor": rec_val,
                        "quantidade": rec_q,
                        "liquidado": rec_liq,
                        "aberto": rec_ab,
                        "ticket_medio": round(rec_val / rec_q, 2) if rec_q > 0 else 0.0
                    },
                    "pagar": {
                        "valor": pag_val,
                        "quantidade": pag_q,
                        "liquidado": pag_liq,
                        "aberto": pag_ab,
                        "ticket_medio": round(pag_val / pag_q, 2) if pag_q > 0 else 0.0
                    },
                    "saldo_liquido": saldo_liq,
                    "ponto_equilibrio": ponto_equilibrio,
                    "indice_cobertura": indice_cob,
                    "status": status_mes,
                    "is_corrente": is_corrente,
                    "is_futuro": is_futuro
                })

            mensal_por_ano[str(a)] = lista_meses
            tot_saldo = round(soma_rec - soma_pag, 2)
            tot_cob = round((soma_rec / soma_pag) * 100, 1) if soma_pag > 0 else (100.0 if soma_rec > 0 else 0.0)

            totais_por_ano[str(a)] = {
                "receber_total": round(soma_rec, 2),
                "pagar_total": round(soma_pag, 2),
                "saldo_liquido_total": tot_saldo,
                "indice_cobertura_total": tot_cob,
                "status_total": "Superávit" if tot_saldo >= 0 else "Déficit",
                "receber_quantidade_total": soma_rec_qtd,
                "pagar_quantidade_total": soma_pag_qtd,
                "receber_aberto_total": round(soma_rec_aberto, 2),
                "pagar_aberto_total": round(soma_pag_aberto, 2),
                "ticket_medio_receber": round(soma_rec / soma_rec_qtd, 2) if soma_rec_qtd > 0 else 0.0,
                "ticket_medio_pagar": round(soma_pag / soma_pag_qtd, 2) if soma_pag_qtd > 0 else 0.0
            }

        # 1. Regressão Linear Simples (OLS) para Tendências no Ano Base
        meses_ano_base = mensal_por_ano.get(str(ano_ref), [])
        limite_mes_calc = mes_atual if ano_ref == ano_atual else 12

        dias_no_mes_atual = calendar.monthrange(ano_ref, mes_atual)[1] if ano_ref == ano_atual else 30
        prorata_fator = (dias_no_mes_atual / max(1, dia_atual)) if (ano_ref == ano_atual and dia_atual < dias_no_mes_atual) else 1.0

        def calc_ols(x_list, y_list):
            k = len(x_list)
            if k < 2:
                mean_y = (y_list[0] if y_list else 0.0)
                return 0.0, mean_y
            sx = sum(x_list)
            sy = sum(y_list)
            sxy = sum(x * y for x, y in zip(x_list, y_list))
            sxx = sum(x * x for x in x_list)
            denom = (k * sxx - sx * sx)
            if denom == 0:
                return 0.0, (sy / k)
            slope = (k * sxy - sx * sy) / denom
            intercept = (sy - slope * sx) / k
            return slope, intercept

        X_m = []
        Y_rec = []
        Y_pag = []
        Y_saldo = []

        for m_data in meses_ano_base:
            m_idx = m_data["mes"]
            if m_idx <= limite_mes_calc:
                vr = m_data["receber"]["valor"]
                vp = m_data["pagar"]["valor"]
                if m_data["is_corrente"] and prorata_fator > 1.0:
                    vr = vr * prorata_fator
                    vp = vp * prorata_fator
                X_m.append(m_idx)
                Y_rec.append(vr)
                Y_pag.append(vp)
                Y_saldo.append(vr - vp)

        slope_rec, int_rec = calc_ols(X_m, Y_rec)
        slope_pag, int_pag = calc_ols(X_m, Y_pag)
        slope_saldo, int_saldo = calc_ols(X_m, Y_saldo)

        trend_rec_12 = [round(max(0.0, slope_rec * m + int_rec), 2) for m in range(1, 13)]
        trend_pag_12 = [round(max(0.0, slope_pag * m + int_pag), 2) for m in range(1, 13)]
        trend_saldo_12 = [round(slope_saldo * m + int_saldo, 2) for m in range(1, 13)]

        # 2. KPIs Financeiros Consolidados
        tot_ref = totais_por_ano.get(str(ano_ref), {})
        rec_ano_ref = tot_ref.get("receber_total", 0.0)
        pag_ano_ref = tot_ref.get("pagar_total", 0.0)
        saldo_ano_ref = tot_ref.get("saldo_liquido_total", 0.0)
        cobertura_ano_ref = tot_ref.get("indice_cobertura_total", 0.0)

        # Ano anterior para comparação YoY
        ano_anterior = ano_ref - 1
        meses_ant = mensal_por_ano.get(str(ano_anterior), [])
        rec_ano_ant_periodo = sum(m["receber"]["valor"] for m in meses_ant if m["mes"] <= limite_mes_calc)
        pag_ano_ant_periodo = sum(m["pagar"]["valor"] for m in meses_ant if m["mes"] <= limite_mes_calc)

        yoy_rec_pct = round(((rec_ano_ref / rec_ano_ant_periodo) - 1.0) * 100, 1) if rec_ano_ant_periodo > 0 else 0.0
        yoy_pag_pct = round(((pag_ano_ref / pag_ano_ant_periodo) - 1.0) * 100, 1) if pag_ano_ant_periodo > 0 else 0.0

        # Melhor mês de superávit e pior mês de déficit
        meses_passados = [m for m in meses_ano_base if m["mes"] <= limite_mes_calc]
        melhor_mes_superavit = max(meses_passados, key=lambda x: x["saldo_liquido"]) if meses_passados else {}
        pior_mes_deficit = min(meses_passados, key=lambda x: x["saldo_liquido"]) if meses_passados else {}

        # Mês atual (em andamento)
        mes_atual_obj = next((m for m in meses_ano_base if m["is_corrente"]), None)
        mes_atual_info = None
        if mes_atual_obj:
            rec_real = mes_atual_obj["receber"]["valor"]
            pag_real = mes_atual_obj["pagar"]["valor"]
            saldo_real = mes_atual_obj["saldo_liquido"]

            rec_proj = round(rec_real * prorata_fator, 2)
            pag_proj = round(pag_real * prorata_fator, 2)
            saldo_proj = round(rec_proj - pag_proj, 2)

            mes_atual_info = {
                "mes": mes_atual_obj["mes"],
                "nome": mes_atual_obj["nome"],
                "abrev": mes_atual_obj["abrev"],
                "dias_corridos": dia_atual,
                "dias_totais": dias_no_mes_atual,
                "prorata_fator": round(prorata_fator, 2),
                "receber_realizado": rec_real,
                "receber_projetado": rec_proj,
                "pagar_realizado": pag_real,
                "pagar_projetado": pag_proj,
                "saldo_realizado": saldo_real,
                "saldo_projetado": saldo_proj,
                "indice_cobertura": mes_atual_obj["indice_cobertura"]
            }

        # Projeção de Fechamento do Ano para Saldo Líquido
        if ano_ref == ano_atual:
            soma_saldo_fechados = sum(m["saldo_liquido"] for m in meses_ano_base if m["mes"] < mes_atual)
            saldo_mes_atual_proj = mes_atual_info["saldo_projetado"] if mes_atual_info else 0.0
            saldo_futuros_trend = sum(trend_saldo_12[m_idx - 1] for m_idx in range(mes_atual + 1, 13))
            projecao_fechamento_saldo = round(soma_saldo_fechados + saldo_mes_atual_proj + saldo_futuros_trend, 2)
        else:
            projecao_fechamento_saldo = saldo_ano_ref

        return {
            "anos": anos,
            "ano_base": ano_ref,
            "ano_atual": ano_atual,
            "mes_atual": mes_atual,
            "dia_atual": dia_atual,
            "regime": regime_clean,
            "situacao": situacao_clean,
            "mensal_por_ano": mensal_por_ano,
            "totais_por_ano": totais_por_ano,
            "tendencia_ano_base": {
                "receber_12_meses": trend_rec_12,
                "pagar_12_meses": trend_pag_12,
                "saldo_12_meses": trend_saldo_12,
                "slope_saldo": round(slope_saldo, 2)
            },
            "kpis": {
                "receber_ano_base": rec_ano_ref,
                "pagar_ano_base": pag_ano_ref,
                "saldo_liquido_ano_base": saldo_ano_ref,
                "indice_cobertura_ano_base": cobertura_ano_ref,
                "receber_ano_ant_periodo": rec_ano_ant_periodo,
                "pagar_ano_ant_periodo": pag_ano_ant_periodo,
                "yoy_receber_pct": yoy_rec_pct,
                "yoy_pagar_pct": yoy_pag_pct,
                "receber_aberto_ano_base": tot_ref.get("receber_aberto_total", 0.0),
                "pagar_aberto_ano_base": tot_ref.get("pagar_aberto_total", 0.0),
                "melhor_mes_superavit": melhor_mes_superavit,
                "pior_mes_deficit": pior_mes_deficit,
                "mes_atual_info": mes_atual_info,
                "projecao_fechamento_saldo": projecao_fechamento_saldo
            }
        }
    except Exception as e:
        logger.error(f"Erro ao gerar dados do dashboard financeiro: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sistema/atualizar")
def atualizar_sistema_git():
    """
    Executa git pull origin main para atualizar a aplicação diretamente do repositório.
    """
    import subprocess
    import threading
    import sys
    
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        result = subprocess.run(
            ["git", "pull", "origin", "main"],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=30
        )
        output = ((result.stdout or '') + "\n" + (result.stderr or '')).strip()
        is_updated = "Already up to date." not in output and "Já atualizado" not in output and "up to date" not in output.lower()

        def restart_worker():
            import time
            time.sleep(1.5)
            try:
                subprocess.Popen([sys.executable, "run_server.py"], cwd=base_dir)
                time.sleep(0.5)
                os._exit(0)
            except Exception as e:
                logger.error(f"Erro ao reiniciar servidor pós-atualização: {e}")

        if result.returncode == 0:
            if is_updated:
                threading.Thread(target=restart_worker, daemon=True).start()
                msg = "Sistema atualizado com sucesso do GitHub! Reiniciando em instantes..."
            else:
                msg = "O sistema já está na versão mais recente do GitHub."
                
            return {
                "success": True,
                "updated": is_updated,
                "message": msg,
                "output": output
            }
        else:
            return {
                "success": False,
                "updated": False,
                "message": "Erro ao atualizar pelo Git.",
                "output": output
            }
    except Exception as e:
        logger.error(f"Erro ao executar git pull: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Serve static files
os.makedirs("static", exist_ok=True)
app.mount("/", StaticFiles(directory="static", html=True), name="static")


