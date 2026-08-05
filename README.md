# 🛠️ Sistema de Ajuste de Ordem de Serviço & Relatório por Enquadramento Fiscal

Aplicação web desenvolvida para consulta e ajuste de **Ordens de Serviço (OS)**, valores tributários, CFOPs, CSTs e emissão de **Relatórios de Clientes por Enquadramento Fiscal** diretamente no banco de dados Firebird (`COMMERCIO.DATAWEB` / Dilab Dataweb).

---

## 🚀 Funcionalidades Principais

### 1. 📋 Módulo de Ajuste de Ordem de Serviço (OS)
* **Busca Rápida de OS**: Pesquisa por número da OS, código interno ou nome do cliente.
* **Modal em Tela Cheia (Full Screen - 98vw)**: Interface expansível para visualização de todos os itens e tributos sem cortes.
* **Ajuste de Operação Fiscal (CFOP)**: Alteração da Operação Fiscal no cabeçalho e individualmente por item.
* **Edição Completa de Tributos Globais (Cabeçalho)**:
  * Valor Total da OS (R$)
  * Desconto Geral (R$)
  * Total ICMS (R$)
  * Total ISSQN / ISS (R$)
  * Total IPI (R$)
  * Total PIS (R$)
  * Total COFINS (R$)
  * Total ICMS ST (Substituição Tributária)
* **Edição de Tributos por Item**:
  * Quantidade, Valor Unitário e Subtotal
  * Alíquota ICMS (%), Base de Cálculo ICMS e Valor ICMS
  * Valor ISSQN, Valor IPI, Valor PIS e Valor COFINS
  * CST / Tributação ICMS
* **Cálculo Automático & Edição Manual**: Recálculo automático dos totais ao alterar alíquotas/subtotais, com suporte a ajuste manual direto nos campos.
* **Gravação Direta no Firebird**: Atualização imediata e segura nas tabelas `TRANSACAO`, `SAIDA` e `TRANSACAO_ITEM`.

---

### 2. 📊 Módulo de Relatório por Enquadramento Fiscal
* **Filtro Exclusivo de Clientes Ativos**: Exibição apenas de pessoas/clientes com cadastro ativo no sistema.
* **Mapeamento Exato do ERP Dilab / Dataweb**:
  * **Simples Nacional** (Código `1`)
  * **MEI** - Microempreendedor Individual (Código `3`)
  * **Outro** (Código `2`)
  * **Nenhum** (Código `0`)
* **Filtros e Pesquisa Rápida**: Busca em tempo real por Razão Social, Nome Fantasia, CNPJ/CPF ou Inscrição Estadual (IE).
* **Painel Estatístico**: Cartões de resumo com contagem em tempo real de clientes por enquadramento.
* **Impressão Nativa com Seleção de Impressora**: Botão **🖨️ Imprimir Relatório** que aciona a janela de impressão do navegador (`window.print()`), permitindo escolher qualquer impressora física no Windows ou exportar para PDF.
* **Layout de Impressão A4 (@media print)**: Formatação que oculta botões, filtros e menus, gerando um documento limpo e legível.

---

## 🛠️ Tecnologias Utilizadas

* **Backend**: Python 3.10+, [FastAPI](https://fastapi.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/), `fdb` (Driver Firebird para Python).
* **Frontend**: HTML5, Vanilla JavaScript (ES6+), CSS3 (Design System com temas escuros, variáveis CSS e suporte a Full Screen).
* **Banco de Dados**: Firebird 2.5 / 3.0.

---

## 📂 Estrutura do Projeto

```text
OS_Ajustes/
├── app.py                 # Servidor backend FastAPI (Rotas API /api/os, /api/clientes, /api/status)
├── run_server.py          # Script inicializador do servidor com abertura automática do navegador
├── estrutura_banco.txt    # Mapeamento do esquema de tabelas e colunas do banco Firebird
├── README.md              # Documentação do projeto
└── static/
    ├── index.html         # Estrutura HTML da aplicação (Abas, Formulários, Tabelas e Modais)
    ├── style.css          # Estilos CSS, Layout Full Screen (98vw) e Regras de Impressão (@media print)
    └── app.js             # Lógica frontend (Manipulação de DOM, requisições Fetch API, cálculos e impressão)
```

---

## ⚙️ Configuração do Banco de Dados

A aplicação lê a configuração de conexão através do arquivo de inicialização do sistema:

* **Arquivo INI**: `c:\dataweb\Dilab\db.ini`
* **Estrutura esperada do `db.ini`**:
  ```ini
  [Main]
  DbServerName=SRVDW
  DbDatabaseName=E:\Dataweb\Dilab\Banco\COMMERCIO.DATAWEB
  ```

---

## 🏁 Como Executar a Aplicação

### 1. Pré-requisitos
Certifique-se de ter o **Python 3** e as bibliotecas necessárias instaladas no ambiente Windows:

```bash
pip install fastapi uvicorn fdb pydantic
```

### 2. Inicialização
Para iniciar o servidor e abrir o sistema automaticamente no seu navegador padrão:

```bash
py run_server.py
```

Ou:

```bash
python run_server.py
```

O servidor será iniciado em **`http://localhost:8000`** e a página será aberta automaticamente.

---

## 💡 Dicas de Uso

* **Atualizar Alterações no Navegador**: Pressione `Ctrl + F5` para limpar o cache do navegador e carregar eventuais atualizações de estilo/scripts.
* **Alternância de Abas**: Utilize os botões superiores no cabeçalho (**📋 Ordens de Serviço** e **📊 Relatório de Enquadramento Fiscal**) para alternar entre os módulos da aplicação.
* **Impressão de Relatórios**: Na aba de relatórios, clique em **🖨️ Imprimir Relatório** para selecionar a impressora física desejada ou salvar como PDF.
