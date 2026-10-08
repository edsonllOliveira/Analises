# 📊 Aspheric Analytics - Gestão Fiscal, Ordens de Serviço & Análises

Plataforma web desenvolvida para consulta e ajuste de **Ordens de Serviço (OS)**, valores tributários, CFOPs, CSTs, curva ABC de clientes e emissão de **Relatórios por Enquadramento Fiscal** diretamente no banco de dados Firebird (`COMMERCIO.DATAWEB` / Dilab Dataweb).

---

## 🚀 Funcionalidades Principais

### 1. 📋 Módulo de Ajuste de Ordem de Serviço (OS)
* **Busca Rápida e Filtros Avançados**: Pesquisa por número da OS, código interno, cliente, período de datas (Data Inicial / Final), quantidade de registros e **Tipo de Operação** (Todas as OSs, Apenas Garantias ou Vendas Normais).
* **Identificação Visual de Garantias e Famílias**: Destaque com badges para ordens emitidas em garantia (`🛡️ Garantia`) e identificação das famílias das lentes e produtos diretamente na tabela.
* **🖨️ Relatório Profissional de Ordens de Serviço & Garantias**:
  * Emissão de relatório executivo com cabeçalho formal e KPIs consolidados (Total de OSs, Faturamento Global, Total ICMS, OSs em Garantia, Volume de Peças em Garantia e Custo/Valor de Garantia).
  * **Painel Especial de Famílias em Garantia**: Resumo consolidado de todas as famílias de lentes emitidas em garantia no período selecionado, com ranking, quantidade de peças, volume de OSs e valor registrado.
  * **Relação Detalhada de OSs**: Tabela completa para impressão com Nº OS, Data, Cliente, Operação Fiscal/CFOP, Famílias das Lentes, ICMS e Total.
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

### 3. 🏷️ Mapeamento e Classificação de CFOPs (Naturezas de Operação)
O sistema lê diretamente a tabela `NATUREZAOPERACAO` do Firebird e categoriza todas as operações pelos seus respectivos **TIPOS**:

| Tipo (`TIPO`) | Categoria de Operação Fiscal | Principais CFOPs Mapeados | Finalidade / Aplicação |
|:---|:---|:---|:---|
| **1** | 🛒 Vendas em Geral | `5.101`, `5.102`, `5.103`, `5.123`, `5.124`, `5.922`, `6.101`, `6.102`, `6.403` | Saída de vendas de produtos, mercadorias de terceiros e prestação de serviços. |
| **2** | 📥 Compras / Entradas | `1.101`, `1.102`, `1.405`, `1.556`, `2.101`, `2.102`, `2.403`, `2.556` | Aquisições para comercialização, matérias-primas e uso/consumo. |
| **3** | 🔄 Devoluções e Trocas | `1.201`, `1.202`, `2.201`, `2.202`, `5.201`, `5.202`, `5.411`, `6.201`, `6.202` | Devoluções de vendas, devoluções de compras e trocas de mercadorias. |
| **4** | 🚚 Transferências | `1.151`, `1.152`, `1.557`, `5.152`, `5.557`, `6.152`, `6.924` | Transferência de estoque entre matriz e filiais da mesma empresa. |
| **5** | 📦 Empréstimos e Demonstração | `1.9491`, `2.9491`, `5.9490`, `5.9491`, `6.912` | Remessas e retornos de mercadorias para demonstração ou empréstimo. |
| **6** | 🎁 Amostra Grátis | `6.911` | Envio de amostras grátis de produtos. |
| **8** | 🛠️ Remessas e Serviços | `5.910`, `5.915`, `5.949-3`, `5.949-4`, `6.915` | Remessas para conserto, garantia e prestação de serviços sem venda. |
| **9** | 🎁 Bonificação e Brindes | `1.910`, `2.910`, `5.910-1`, `6.910` | Entrada/saída em bonificação, doação ou brindes comerciais. |
| **10** | 🏭 Industrialização / Encomenda | `1.124`, `2.124`, `5.901`, `5.902`, `6.901` | Remessa e retorno de insumos para industrialização por encomenda. |
| **11** | 📅 Vendas p/ Entrega Futura | `5.117`, `5.117-1`, `5116`, `6.117`, `6.117-1`, `6116` | Faturamento antecipado de vendas de produção/terceiros. |
| **12** | 🏢 Venda de Imobilizado & Outras | `5.551`, `6.551`, `1.949`, `2.949-5`, `5.949-1`, `7.949` | Venda de bens do ativo imobilizado e saídas operacionais diversas. |
| **13** | ⚠️ Baixa / Perda / Roubo | `5.927`, `6.927` | Baixas de estoque por avaria, perda, roubo ou deterioração. |
| **14** | 🛡️ Remessa / Troca em Garantia | `6.949-4`, `6949-3` | Remessa e substituição de itens em garantia. |
| **15** | ↩️ Retorno de Insumos | `1.903`, `5903` | Retorno de insumos não utilizados na produção. |
| **21** | 🤝 Remessa por Conta e Ordem | `6.923-1` | Remessa por conta e ordem de terceiros em vendas à ordem. |

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

### 3. Execução em Segundo Plano (Modo Oculto)
Para rodar a aplicação sem abrir a janela preta do terminal (CMD):
- Dê um duplo clique no arquivo **`start_server_hidden.vbs`**.
- Ou execute no prompt: `wscript start_server_hidden.vbs`

O servidor será iniciado em **`http://localhost:8011`** e a página será aberta automaticamente no navegador.

---

## 💡 Dicas de Uso

* **Atualizar Alterações no Navegador**: Pressione `Ctrl + F5` para limpar o cache do navegador e carregar eventuais atualizações de estilo/scripts.
* **Alternância de Abas**: Utilize os botões superiores no cabeçalho (**📋 Ordens de Serviço** e **📊 Relatório de Enquadramento Fiscal**) para alternar entre os módulos da aplicação.
* **Impressão de Relatórios**: Na aba de relatórios, clique em **🖨️ Imprimir Relatório** para selecionar a impressora física desejada ou salvar como PDF.
