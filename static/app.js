// State Management
let naturezasList = [];
let currentOS = null;
let currentDbKey = 'producao';

// DOM Elements
const dbSelect = document.getElementById('dbSelect');
const dbStatusBadge = document.getElementById('dbStatusBadge');
const dbStatusText = document.getElementById('dbStatusText');
const btnRefreshStatus = document.getElementById('btnRefreshStatus');
const btnUpdateGit = document.getElementById('btnUpdateGit');
const searchInput = document.getElementById('searchInput');
const limitSelect = document.getElementById('limitSelect');
const osTipoFiltro = document.getElementById('osTipoFiltro');
const btnSearch = document.getElementById('btnSearch');
const btnPrintOSReport = document.getElementById('btnPrintOSReport');
const printOsReportContainer = document.getElementById('printOsReportContainer');
const osTableBody = document.getElementById('osTableBody');
const resultCountBadge = document.getElementById('resultCountBadge');
let currentOsList = [];
let lastOSSearchParams = null;

// Modal Elements
const editModal = document.getElementById('editModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelEdit = document.getElementById('btnCancelEdit');
const btnSaveOS = document.getElementById('btnSaveOS');
const btnRecalculate = document.getElementById('btnRecalculate');
const modalOsTitle = document.getElementById('modalOsTitle');
const modalClientName = document.getElementById('modalClientName');
const modalOperacaoFiscal = document.getElementById('modalOperacaoFiscal');
const modalValorDesconto = document.getElementById('modalValorDesconto');
const modalTotalOS = document.getElementById('modalTotalOS');
const modalTotalICMS = document.getElementById('modalTotalICMS');
const itemsTableBody = document.getElementById('itemsTableBody');

// Toast Notification Helper
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Currency Formatter
function formatMoney(val) {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);
}

// Date Formatter (dd/mm/yyyy)
function formatDateBR(dateStr) {
    if (!dateStr || dateStr === 'None' || dateStr === 'null') return 'N/A';
    const str = String(dateStr).trim();
    if (!str) return 'N/A';
    
    if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
        return str.substring(0, 10);
    }
    
    const cleanStr = str.split(' ')[0].split('T')[0];
    const parts = cleanStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    }
    return str;
}

// HTML Escaper Helper
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Load Databases Info & Populate Select
async function loadDatabaseSelector() {
    try {
        const res = await fetch('/api/databases');
        const data = await res.json();
        
        currentDbKey = data.active_key;
        
        dbSelect.innerHTML = '';
        data.databases.forEach(db => {
            const opt = document.createElement('option');
            opt.value = db.key;
            
            let label = db.name;
            if (!db.exists) {
                label += ' (Arquivo .ini não encontrado)';
            }
            opt.textContent = label;
            if (db.active) opt.selected = true;
            dbSelect.appendChild(opt);
        });
        
        // Add option to enter custom path if not already listed
        if (!data.databases.some(d => d.key === 'custom')) {
            const optCustom = document.createElement('option');
            optCustom.value = 'custom';
            optCustom.textContent = '⚙️ Informar outro db.ini...';
            dbSelect.appendChild(optCustom);
        }
    } catch (e) {
        console.error('Erro ao carregar lista de bancos:', e);
    }
}

// Handle Database Selection Change
async function handleDatabaseChange() {
    const selectedKey = dbSelect.value;
    let customPath = null;
    
    if (selectedKey === 'custom') {
        customPath = prompt(
            'Digite o caminho completo do arquivo db.ini:', 
            'c:\\dataweb\\Dilab\\db.ini'
        );
        if (!customPath || !customPath.trim()) {
            dbSelect.value = currentDbKey;
            return;
        }
    }
    
    dbStatusBadge.className = 'status-badge loading';
    dbStatusText.textContent = 'Conectando ao novo banco...';
    
    try {
        const res = await fetch('/api/databases/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                db_key: selectedKey,
                custom_path: customPath
            })
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Erro ao trocar banco de dados.');
        }
        
        const data = await res.json();
        currentDbKey = data.active_key;
        
        showToast(`Banco alterado para: ${data.database} (${data.server})`, 'success');
        
        await checkStatus();
        await loadNaturezas();
        await searchOS();
        await loadDatabaseSelector();
    } catch (e) {
        showToast(e.message, 'error');
        dbSelect.value = currentDbKey;
        checkStatus();
    }
}

// Check Database Status
async function checkStatus() {
    dbStatusBadge.className = 'status-badge loading';
    dbStatusText.textContent = 'Verificando banco...';
    
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        if (data.status === 'connected') {
            dbStatusBadge.className = 'status-badge connected';
            dbStatusText.textContent = `Firebird OK (${data.server} | OS: ${data.total_os})`;
        } else {
            dbStatusBadge.className = 'status-badge error';
            dbStatusText.textContent = 'Erro ao conectar no banco';
            showToast(`Erro no banco: ${data.error}`, 'error');
        }
    } catch (e) {
        dbStatusBadge.className = 'status-badge error';
        dbStatusText.textContent = 'Servidor Offline';
        showToast('Não foi possível conectar à API backend.', 'error');
    }
}

if (btnRefreshStatus) {
    btnRefreshStatus.addEventListener('click', () => {
        checkStatus();
        loadDatabaseSelector();
    });
}

if (btnUpdateGit) {
    btnUpdateGit.addEventListener('click', async () => {
        if (!confirm('Deseja verificar e baixar atualizações do GitHub agora?')) return;
        
        btnUpdateGit.disabled = true;
        const originalHtml = btnUpdateGit.innerHTML;
        btnUpdateGit.innerHTML = '<span>⏳</span><span>Atualizando...</span>';
        showToast('Buscando atualizações no GitHub...', 'info');

        try {
            const res = await fetch('/api/sistema/atualizar', { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                if (data.updated) {
                    showToast(data.message, 'success');
                    setTimeout(() => {
                        showToast('Reiniciando aplicação... aguarde...', 'info');
                        setTimeout(() => window.location.reload(), 3000);
                    }, 1000);
                } else {
                    showToast(data.message, 'info');
                }
            } else {
                showToast(data.message || 'Erro ao atualizar.', 'error');
            }
        } catch (e) {
            showToast('Erro ao comunicar com o servidor: ' + e.message, 'error');
        } finally {
            btnUpdateGit.disabled = false;
            btnUpdateGit.innerHTML = originalHtml;
        }
    });
}

// Load Naturezas de Operação
async function loadNaturezas() {
    try {
        const res = await fetch('/api/naturezas');
        naturezasList = await res.json();
        
        modalOperacaoFiscal.innerHTML = '<option value="">-- Selecione Operação Fiscal --</option>';
        naturezasList.forEach(nat => {
            const opt = document.createElement('option');
            opt.value = nat.cod;
            opt.textContent = `${nat.cod} - ${nat.descricao}`;
            modalOperacaoFiscal.appendChild(opt);
        });
    } catch (e) {
        showToast('Erro ao carregar lista de operações fiscais.', 'error');
    }
}

// Search OS Records & Client Autocomplete
const osSearchClientInput = document.getElementById('osSearchClientInput');
const osClientAutocompleteList = document.getElementById('osClientAutocompleteList');
const btnClearClientSearch = document.getElementById('btnClearClientSearch');
const osDateInicio = document.getElementById('osDateInicio');
const osDateFim = document.getElementById('osDateFim');

let selectedSearchCodPessoa = null;
let activeAutocompleteIndex = -1;
let autocompleteDebounceTimer = null;

if (osSearchClientInput && osClientAutocompleteList) {
    osSearchClientInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        selectedSearchCodPessoa = null;

        if (btnClearClientSearch) {
            if (val) btnClearClientSearch.classList.remove('hidden');
            else btnClearClientSearch.classList.add('hidden');
        }

        if (autocompleteDebounceTimer) clearTimeout(autocompleteDebounceTimer);

        if (val.length < 1) {
            osClientAutocompleteList.classList.add('hidden');
            osClientAutocompleteList.innerHTML = '';
            return;
        }

        autocompleteDebounceTimer = setTimeout(() => {
            fetchClientAutocomplete(val);
        }, 250);
    });

    osSearchClientInput.addEventListener('keydown', (e) => {
        const items = osClientAutocompleteList.querySelectorAll('.autocomplete-item');
        if (osClientAutocompleteList.classList.contains('hidden') || items.length === 0) {
            if (e.key === 'Enter') {
                searchOS();
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeAutocompleteIndex = (activeAutocompleteIndex + 1) % items.length;
            highlightAutocompleteItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeAutocompleteIndex = (activeAutocompleteIndex - 1 + items.length) % items.length;
            highlightAutocompleteItem(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeAutocompleteIndex >= 0 && items[activeAutocompleteIndex]) {
                items[activeAutocompleteIndex].click();
            } else {
                searchOS();
            }
        } else if (e.key === 'Escape') {
            osClientAutocompleteList.classList.add('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-wrapper')) {
            osClientAutocompleteList.classList.add('hidden');
        }
    });
}

if (btnClearClientSearch) {
    btnClearClientSearch.addEventListener('click', () => {
        if (osSearchClientInput) osSearchClientInput.value = '';
        selectedSearchCodPessoa = null;
        btnClearClientSearch.classList.add('hidden');
        if (osClientAutocompleteList) osClientAutocompleteList.classList.add('hidden');
        searchOS();
    });
}

function highlightAutocompleteItem(items) {
    items.forEach((item, index) => {
        if (index === activeAutocompleteIndex) {
            item.classList.add('active');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('active');
        }
    });
}

async function fetchClientAutocomplete(query) {
    try {
        const res = await fetch(`/api/clientes/autocomplete?q=${encodeURIComponent(query)}&limit=15`);
        if (!res.ok) return;
        const list = await res.json();
        renderClientAutocompleteList(list);
    } catch (e) {
        console.error('Erro no autocompletar clientes:', e);
    }
}

function renderClientAutocompleteList(list) {
    if (!osClientAutocompleteList) return;
    activeAutocompleteIndex = -1;

    if (!list || list.length === 0) {
        osClientAutocompleteList.innerHTML = '<div class="autocomplete-no-results">Nenhum cliente encontrado</div>';
        osClientAutocompleteList.classList.remove('hidden');
        return;
    }

    osClientAutocompleteList.innerHTML = list.map((c) => {
        const idCode = (c.identificador !== undefined && c.identificador !== null) ? c.identificador : c.cod_pessoa;
        return `
            <div class="autocomplete-item" data-cod="${c.cod_pessoa}" data-ident="${idCode}" data-name="${escapeHtml(c.display_name)}">
                <span class="item-title">Cód: ${idCode} - ${escapeHtml(c.display_name)}</span>
                <span class="item-sub">${c.doc ? `Doc: ${escapeHtml(c.doc)} | ` : ''}ID Reg: #${c.cod_pessoa}</span>
            </div>
        `;
    }).join('');

    osClientAutocompleteList.classList.remove('hidden');

    osClientAutocompleteList.querySelectorAll('.autocomplete-item').forEach(el => {
        el.addEventListener('click', () => {
            const cod = el.getAttribute('data-cod');
            const ident = el.getAttribute('data-ident');
            const name = el.getAttribute('data-name');
            
            selectedSearchCodPessoa = cod;
            if (osSearchClientInput) {
                osSearchClientInput.value = `Cód: ${ident} - ${name}`;
            }
            if (btnClearClientSearch) btnClearClientSearch.classList.remove('hidden');
            osClientAutocompleteList.classList.add('hidden');
            
            searchOS();
        });
    });
}

async function searchOS() {
    const query = searchInput ? searchInput.value.trim() : '';
    let cliente = '';
    if (selectedSearchCodPessoa) {
        cliente = String(selectedSearchCodPessoa);
    } else if (osSearchClientInput) {
        let rawVal = osSearchClientInput.value.trim();
        if (rawVal.startsWith('Cód:')) {
            const parts = rawVal.split(' - ');
            cliente = parts[0].replace('Cód:', '').trim();
        } else if (rawVal.startsWith('#')) {
            const parts = rawVal.split(' - ');
            cliente = parts[0].replace('#', '').trim();
        } else {
            cliente = rawVal;
        }
    }
    const dtIni = osDateInicio ? osDateInicio.value : '';
    const dtFim = osDateFim ? osDateFim.value : '';
    const limit = limitSelect ? limitSelect.value : '30';
    const tipoOs = osTipoFiltro ? osTipoFiltro.value : 'todas';

    lastOSSearchParams = {
        query: query,
        cliente: cliente,
        dtIni: dtIni,
        dtFim: dtFim,
        tipoOs: tipoOs
    };
    
    btnSearch.disabled = true;
    btnSearch.innerHTML = '<span>Carregando...</span>';
    
    try {
        let url = `/api/os?limit=${limit}&tipo_os=${encodeURIComponent(tipoOs)}`;
        if (query) url += `&search=${encodeURIComponent(query)}`;
        if (cliente) url += `&cliente=${encodeURIComponent(cliente)}`;
        if (dtIni) url += `&data_inicio=${encodeURIComponent(dtIni)}`;
        if (dtFim) url += `&data_fim=${encodeURIComponent(dtFim)}`;
        
        const res = await fetch(url);
        if (!res.ok) throw new Error('Erro ao buscar ordens de serviço.');
        
        const data = await res.json();
        currentOsList = data;
        renderOSTable(data);
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btnSearch.disabled = false;
        btnSearch.innerHTML = '<span>Buscar OS</span>';
    }
}

// Render OS Table
function renderOSTable(list) {
    resultCountBadge.textContent = `${list.length} encontradas`;
    
    if (list.length === 0) {
        osTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center empty-state">
                    Nenhuma Ordem de Serviço encontrada com os critérios informados.
                </td>
            </tr>
        `;
        return;
    }
    
    osTableBody.innerHTML = list.map(os => {
        const isGar = os.is_garantia;
        const famsList = os.familias || [];
        const famsDisplay = famsList.length > 0 
            ? famsList.slice(0, 2).map(f => `<span class="badge" style="font-size: 0.72rem; padding: 2px 5px; border-color: ${isGar ? '#ea580c' : 'var(--border-color)'}; color: ${isGar ? '#fb923c' : 'var(--text-secondary)'};" title="${escapeHtml(f)}">${escapeHtml(f)}</span>`).join(' ') + (famsList.length > 2 ? ` <span class="badge" title="${escapeHtml(famsList.join(', '))}">+${famsList.length - 2}</span>` : '')
            : '<span style="color: var(--text-tertiary); font-size: 0.75rem;">-</span>';

        return `
            <tr style="${isGar ? 'background: rgba(234, 88, 12, 0.05);' : ''}">
                <td>
                    <strong>#${os.numero_os}</strong>
                    ${isGar ? '<span class="badge" style="display: block; width: fit-content; margin-top: 2px; font-size: 0.68rem; border-color: #ea580c; color: #fb923c; background: rgba(234, 88, 12, 0.12); font-weight: bold;">🛡️ Garantia</span>' : ''}
                </td>
                <td>${os.cod_ordemservico}</td>
                <td>${escapeHtml(os.cliente_nome)}</td>
                <td>${formatDateBR(os.data_emissao)}</td>
                <td>
                    <span class="badge" title="${escapeHtml(os.natureza_descricao || '')}" style="${isGar ? 'border-color: #ea580c; color: #fb923c;' : ''}">
                        ${escapeHtml(os.cod_naturezaoperacao || 'Sem CFOP')}
                    </span>
                    <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 2px; max-width: 170px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(os.natureza_descricao || '')}">
                        ${escapeHtml(os.natureza_descricao || '')}
                    </div>
                </td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 2px; max-width: 260px;">
                        ${famsDisplay}
                    </div>
                </td>
                <td><strong>R$ ${formatMoney(os.total)}</strong></td>
                <td style="color: #10b981;"><strong>R$ ${formatMoney(os.total_icms)}</strong></td>
                <td class="text-center">
                    <button class="btn btn-primary btn-sm" onclick="openEditModal(${os.cod_ordemservico}, ${os.cod_empresa})">
                        ✏️ Editar OS
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Open Edit Modal & Fetch OS Details
async function openEditModal(codOS, codEmpresa) {
    try {
        const res = await fetch(`/api/os/${codOS}?cod_empresa=${codEmpresa}`);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Erro ao carregar OS.');
        }
        
        currentOS = await res.json();
        populateModalData();
        editModal.classList.remove('hidden');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// Populate Modal with Loaded OS Data
function populateModalData() {
    if (!currentOS) return;
    
    const h = currentOS.header;
    modalOsTitle.textContent = `Edição de OS #${h.numero_os} (ID: ${h.cod_ordemservico})`;
    modalClientName.textContent = `Cliente: ${h.cliente_nome}` + (h.data_emissao ? ` | Emissão: ${formatDateBR(h.data_emissao)}` : '');
    
    modalOperacaoFiscal.value = h.cod_naturezaoperacao || '';
    modalValorDesconto.value = (h.valor_desconto || 0).toFixed(2);
    modalTotalOS.value = (h.total || 0).toFixed(2);
    
    const modalTotalICMSOperacao = document.getElementById('modalTotalICMSOperacao');
    const modalTotalICMSDiferido = document.getElementById('modalTotalICMSDiferido');
    const modalTotalICMS = document.getElementById('modalTotalICMS');
    const modalTotalISSQN = document.getElementById('modalTotalISSQN');
    const modalTotalIPI = document.getElementById('modalTotalIPI');
    const modalTotalPIS = document.getElementById('modalTotalPIS');
    const modalTotalCOFINS = document.getElementById('modalTotalCOFINS');
    const modalTotalICMSST = document.getElementById('modalTotalICMSST');

    if (modalTotalICMSOperacao) modalTotalICMSOperacao.value = (h.total_icms_operacao || h.total_icms || 0).toFixed(2);
    if (modalTotalICMSDiferido) modalTotalICMSDiferido.value = (h.total_icms_diferido || 0).toFixed(2);
    if (modalTotalICMS) modalTotalICMS.value = (h.total_icms || 0).toFixed(2);
    if (modalTotalISSQN) modalTotalISSQN.value = (h.total_issqn || 0).toFixed(2);
    if (modalTotalIPI) modalTotalIPI.value = (h.total_ipi || 0).toFixed(2);
    if (modalTotalPIS) modalTotalPIS.value = (h.total_pis || 0).toFixed(2);
    if (modalTotalCOFINS) modalTotalCOFINS.value = (h.total_cofins || 0).toFixed(2);
    if (modalTotalICMSST) modalTotalICMSST.value = (h.total_icms_st || 0).toFixed(2);
    
    renderItemsTable();
}

// Render Items Table in Modal
function renderItemsTable() {
    if (!currentOS || !currentOS.items) return;
    
    itemsTableBody.innerHTML = currentOS.items.map((item, idx) => {
        const vorig = item.valor_original || item.valorunitario || 0.0;
        const pdesc = item.percentual_desconto || 0.0;
        const vdesc = item.valordesconto || 0.0;

        return `
            <tr data-index="${idx}">
                <td><strong>${item.cod_item}</strong></td>
                <td><input type="text" class="form-control item-desc" id="desc_${idx}" value="${escapeHtml(item.descricao)}"></td>
                <td><input type="number" step="1" class="form-control text-right" id="qtd_${idx}" value="${item.quantidade}" oninput="calcRowDiscountPct(${idx})"></td>
                <td><input type="number" step="0.01" class="form-control text-right" id="vorig_${idx}" value="${vorig.toFixed(2)}" oninput="calcRowDiscountPct(${idx})"></td>
                <td><input type="number" step="0.01" class="form-control text-right" id="pdesc_${idx}" value="${pdesc.toFixed(2)}" oninput="calcRowDiscountPct(${idx})"></td>
                <td><input type="number" step="0.01" class="form-control text-right" id="vdesc_${idx}" value="${vdesc.toFixed(2)}" oninput="calcRowDiscountVal(${idx})"></td>
                <td><input type="number" step="0.01" class="form-control text-right highlight-input" id="total_${idx}" value="${(item.total || 0).toFixed(2)}" oninput="calcRowSubtotalManual(${idx})"></td>
                <td>
                    <select class="form-control" id="nat_${idx}">
                        <option value="">(Usar Cabeçalho)</option>
                        ${naturezasList.map(n => `<option value="${n.cod}" ${n.cod === item.cod_naturezaoperacao ? 'selected' : ''}>${n.cod} - ${n.descricao}</option>`).join('')}
                    </select>
                </td>
                <td><input type="text" class="form-control text-center" id="cst_${idx}" value="${item.tributacaoicms || '00'}" maxlength="3" oninput="calcRowICMS(${idx})"></td>
                <td><input type="number" step="0.01" class="form-control text-right" id="aliqicms_${idx}" value="${(item.aliquotaicms || 0).toFixed(2)}" oninput="calcRowICMS(${idx})"></td>
                <td><input type="number" step="0.01" class="form-control text-right" id="aliqdificms_${idx}" value="${(item.aliquotaicmsdiferimento || 0).toFixed(2)}" oninput="calcRowICMS(${idx})" placeholder="0.00"></td>
                <td><input type="number" step="0.01" class="form-control text-right" id="baseicms_${idx}" value="${(item.basecalculoicms || 0).toFixed(2)}" oninput="calcRowICMSManual(${idx})"></td>
                <td><input type="number" step="0.01" class="form-control text-right" id="icmsoper_${idx}" value="${(item.icms_operacao || 0).toFixed(2)}" readonly style="opacity:0.7;cursor:default;"></td>
                <td><input type="number" step="0.01" class="form-control text-right" id="icmsdif_${idx}" value="${(item.icms_diferido || 0).toFixed(2)}" readonly style="opacity:0.7;cursor:default;"></td>
                <td><input type="number" step="0.01" class="form-control text-right highlight-input-blue" id="vlicms_${idx}" value="${(item.totalicms || 0).toFixed(2)}" oninput="calcRowICMSValManual(${idx})"></td>
                <td><input type="number" step="0.01" class="form-control text-right" id="vliss_${idx}" value="${(item.totalissqn || 0).toFixed(2)}" oninput="recalculateTotalsHeader()"></td>
                <td><input type="number" step="0.01" class="form-control text-right" id="vlipi_${idx}" value="${(item.totalipi || 0).toFixed(2)}" oninput="recalculateTotalsHeader()"></td>
                <td><input type="number" step="0.01" class="form-control text-right" id="vlpis_${idx}" value="${(item.totalpis || 0).toFixed(2)}" oninput="recalculateTotalsHeader()"></td>
                <td><input type="number" step="0.01" class="form-control text-right" id="vlcofins_${idx}" value="${(item.totalcofins || 0).toFixed(2)}" oninput="recalculateTotalsHeader()"></td>
            </tr>
        `;
    }).join('');
}

// Live Calculations for Row Values & Discounts
function calcRowDiscountPct(idx) {
    const qtdEl = document.getElementById(`qtd_${idx}`);
    const vorigEl = document.getElementById(`vorig_${idx}`);
    const pdescEl = document.getElementById(`pdesc_${idx}`);
    const vdescEl = document.getElementById(`vdesc_${idx}`);
    const totalEl = document.getElementById(`total_${idx}`);

    if (!qtdEl || !vorigEl || !pdescEl || !vdescEl || !totalEl) return;

    const qtd = parseFloat(qtdEl.value) || 0;
    const vorig = parseFloat(vorigEl.value) || 0;
    const pdesc = parseFloat(pdescEl.value) || 0;

    const totalBruto = vorig * qtd;
    const vdesc = totalBruto * (pdesc / 100.0);
    const totalFinal = Math.max(0, totalBruto - vdesc);

    vdescEl.value = vdesc.toFixed(2);
    totalEl.value = totalFinal.toFixed(2);

    calcRowICMS(idx);
}

function calcRowDiscountVal(idx) {
    const qtdEl = document.getElementById(`qtd_${idx}`);
    const vorigEl = document.getElementById(`vorig_${idx}`);
    const pdescEl = document.getElementById(`pdesc_${idx}`);
    const vdescEl = document.getElementById(`vdesc_${idx}`);
    const totalEl = document.getElementById(`total_${idx}`);

    if (!qtdEl || !vorigEl || !pdescEl || !vdescEl || !totalEl) return;

    const qtd = parseFloat(qtdEl.value) || 0;
    const vorig = parseFloat(vorigEl.value) || 0;
    const vdesc = parseFloat(vdescEl.value) || 0;

    const totalBruto = vorig * qtd;
    const pdesc = totalBruto > 0 ? (vdesc / totalBruto * 100.0) : 0.0;
    const totalFinal = Math.max(0, totalBruto - vdesc);

    pdescEl.value = pdesc.toFixed(2);
    totalEl.value = totalFinal.toFixed(2);

    calcRowICMS(idx);
}

function calcRowValues(idx) {
    calcRowDiscountPct(idx);
}

function calcRowSubtotalManual(idx) {
    calcRowICMS(idx);
}

// Calculate Row ICMS (Base = Subtotal, ICMS com suporte a Diferimento para CST 51)
function calcRowICMS(idx) {
    const totalEl = document.getElementById(`total_${idx}`);
    const cstEl = document.getElementById(`cst_${idx}`);
    const aliqEl = document.getElementById(`aliqicms_${idx}`);
    const aliqdifEl = document.getElementById(`aliqdificms_${idx}`);
    const baseEl = document.getElementById(`baseicms_${idx}`);
    const icmsOperEl = document.getElementById(`icmsoper_${idx}`);
    const icmsDifEl = document.getElementById(`icmsdif_${idx}`);
    const vlicmsEl = document.getElementById(`vlicms_${idx}`);
    
    if (!totalEl || !aliqEl || !baseEl || !vlicmsEl) return;

    const subtotal = parseFloat(totalEl.value) || 0;
    const aliqNominal = parseFloat(aliqEl.value) || 0;
    const cst = cstEl ? String(cstEl.value).trim() : '00';
    let aliqDif = aliqdifEl ? (parseFloat(aliqdifEl.value) || 0) : 0;
    
    // Base de cálculo do ICMS
    const base = subtotal;
    
    // Se o CST for de diferimento (51, 051, 151, 251)
    const isDiferimento = (cst === '51' || cst === '051' || cst === '151' || cst === '251');
    
    // Se for CST 51 e o percentual de diferimento não foi preenchido manualmente
    if (isDiferimento && aliqNominal > 0 && aliqDif === 0) {
        if (aliqNominal > 12.0) {
            aliqDif = ((aliqNominal - 12.0) / aliqNominal) * 100.0;
            if (aliqdifEl) aliqdifEl.value = aliqDif.toFixed(2);
        }
    }
    
    // ICMS da operação (cheio, antes do diferimento)
    const icmsOperacao = base * (aliqNominal / 100.0);
    
    // ICMS diferido
    const icmsDiferido = isDiferimento ? (icmsOperacao * (aliqDif / 100.0)) : 0;
    
    // ICMS efetivo (a recolher) = operação - diferido
    const vlicms = isDiferimento ? (icmsOperacao - icmsDiferido) : icmsOperacao;
    
    baseEl.value = base.toFixed(2);
    if (icmsOperEl) icmsOperEl.value = isDiferimento ? icmsOperacao.toFixed(2) : '0.00';
    if (icmsDifEl) icmsDifEl.value = icmsDiferido.toFixed(2);
    vlicmsEl.value = vlicms.toFixed(2);
    
    recalculateTotalsHeader();
}

// Manual edit of Base ICMS
function calcRowICMSManual(idx) {
    const cstEl = document.getElementById(`cst_${idx}`);
    const aliqEl = document.getElementById(`aliqicms_${idx}`);
    const aliqdifEl = document.getElementById(`aliqdificms_${idx}`);
    const baseEl = document.getElementById(`baseicms_${idx}`);
    const icmsOperEl = document.getElementById(`icmsoper_${idx}`);
    const icmsDifEl = document.getElementById(`icmsdif_${idx}`);
    const vlicmsEl = document.getElementById(`vlicms_${idx}`);
    
    const aliqNominal = parseFloat(aliqEl.value) || 0;
    const aliqDif = aliqdifEl ? (parseFloat(aliqdifEl.value) || 0) : 0;
    const base = parseFloat(baseEl.value) || 0;
    const cst = cstEl ? String(cstEl.value).trim() : '00';
    const isDiferimento = (cst === '51' || cst === '051' || cst === '151' || cst === '251');
    
    const icmsOperacao = base * (aliqNominal / 100.0);
    const icmsDiferido = isDiferimento ? (icmsOperacao * (aliqDif / 100.0)) : 0;
    const vlicms = isDiferimento ? (icmsOperacao - icmsDiferido) : icmsOperacao;
    
    if (icmsOperEl) icmsOperEl.value = isDiferimento ? icmsOperacao.toFixed(2) : '0.00';
    if (icmsDifEl) icmsDifEl.value = icmsDiferido.toFixed(2);
    vlicmsEl.value = vlicms.toFixed(2);
    
    recalculateTotalsHeader();
}

// Manual edit of Valor ICMS directly in item
function calcRowICMSValManual(idx) {
    recalculateTotalsHeader();
}

// Recalculate OS Totals Header
function recalculateTotalsHeader() {
    if (!currentOS || !currentOS.items) return;
    
    let sumTotal = 0;
    let sumICMSOper = 0;
    let sumICMSDif = 0;
    let sumICMSEfet = 0;
    let sumISSQN = 0;
    let sumIPI = 0;
    let sumPIS = 0;
    let sumCOFINS = 0;
    
    currentOS.items.forEach((it, idx) => {
        const totalEl = document.getElementById(`total_${idx}`);
        const icmsoperEl = document.getElementById(`icmsoper_${idx}`);
        const icmsdifEl = document.getElementById(`icmsdif_${idx}`);
        const vlicmsEl = document.getElementById(`vlicms_${idx}`);
        const vlissEl = document.getElementById(`vliss_${idx}`);
        const vlipiEl = document.getElementById(`vlipi_${idx}`);
        const vlpisEl = document.getElementById(`vlpis_${idx}`);
        const vlcofinsEl = document.getElementById(`vlcofins_${idx}`);
        
        const rowTotal = totalEl ? (parseFloat(totalEl.value) || 0) : (it.total || 0);
        const rowICMSOper = icmsoperEl ? (parseFloat(icmsoperEl.value) || 0) : (it.icms_operacao || 0);
        const rowICMSDif = icmsdifEl ? (parseFloat(icmsdifEl.value) || 0) : (it.icms_diferido || 0);
        const rowICMSEfet = vlicmsEl ? (parseFloat(vlicmsEl.value) || 0) : (it.totalicms || 0);
        const rowISS = vlissEl ? (parseFloat(vlissEl.value) || 0) : (it.totalissqn || 0);
        const rowIPI = vlipiEl ? (parseFloat(vlipiEl.value) || 0) : (it.totalipi || 0);
        const rowPIS = vlpisEl ? (parseFloat(vlpisEl.value) || 0) : (it.totalpis || 0);
        const rowCOFINS = vlcofinsEl ? (parseFloat(vlcofinsEl.value) || 0) : (it.totalcofins || 0);
        
        sumTotal += rowTotal;
        sumICMSOper += rowICMSOper;
        sumICMSDif += rowICMSDif;
        sumICMSEfet += rowICMSEfet;
        sumISSQN += rowISS;
        sumIPI += rowIPI;
        sumPIS += rowPIS;
        sumCOFINS += rowCOFINS;
    });
    
    const desconto = parseFloat(modalValorDesconto.value) || 0;
    const finalTotal = Math.max(0, sumTotal - desconto);
    
    modalTotalOS.value = finalTotal.toFixed(2);
    
    const modalTotalICMSOperacao = document.getElementById('modalTotalICMSOperacao');
    const modalTotalICMSDiferido = document.getElementById('modalTotalICMSDiferido');
    const modalTotalICMS = document.getElementById('modalTotalICMS');
    const modalTotalISSQN = document.getElementById('modalTotalISSQN');
    const modalTotalIPI = document.getElementById('modalTotalIPI');
    const modalTotalPIS = document.getElementById('modalTotalPIS');
    const modalTotalCOFINS = document.getElementById('modalTotalCOFINS');
    
    if (modalTotalICMSOperacao) modalTotalICMSOperacao.value = sumICMSOper.toFixed(2);
    if (modalTotalICMSDiferido) modalTotalICMSDiferido.value = sumICMSDif.toFixed(2);
    if (modalTotalICMS) modalTotalICMS.value = sumICMSEfet.toFixed(2);
    if (modalTotalISSQN) modalTotalISSQN.value = sumISSQN.toFixed(2);
    if (modalTotalIPI) modalTotalIPI.value = sumIPI.toFixed(2);
    if (modalTotalPIS) modalTotalPIS.value = sumPIS.toFixed(2);
    if (modalTotalCOFINS) modalTotalCOFINS.value = sumCOFINS.toFixed(2);
}

// Global Recalculate Button Action
function recalculateAll() {
    if (!currentOS || !currentOS.items) return;
    
    currentOS.items.forEach((item, idx) => {
        calcRowValues(idx);
    });
    showToast('Tributos e Totais recalculados automaticamente!', 'info');
}

// Save OS Changes to Firebird Database
async function saveOS() {
    if (!currentOS) return;
    
    btnSaveOS.disabled = true;
    btnSaveOS.innerHTML = '<span>Salvando no Banco...</span>';
    
    try {
        const modalTotalICMS = document.getElementById('modalTotalICMS');
        const modalTotalISSQN = document.getElementById('modalTotalISSQN');
        const modalTotalIPI = document.getElementById('modalTotalIPI');
        const modalTotalPIS = document.getElementById('modalTotalPIS');
        const modalTotalCOFINS = document.getElementById('modalTotalCOFINS');
        const modalTotalICMSST = document.getElementById('modalTotalICMSST');

        // Build items directly from live DOM inputs to capture ALL user edits 100%
        const itemsPayload = currentOS.items.map((it, idx) => {
            const descEl = document.getElementById(`desc_${idx}`);
            const qtdEl = document.getElementById(`qtd_${idx}`);
            const vorigEl = document.getElementById(`vorig_${idx}`);
            const vdescEl = document.getElementById(`vdesc_${idx}`);
            const totalEl = document.getElementById(`total_${idx}`);
            const natEl = document.getElementById(`nat_${idx}`);
            const aliqEl = document.getElementById(`aliqicms_${idx}`);
            const baseEl = document.getElementById(`baseicms_${idx}`);
            const vlicmsEl = document.getElementById(`vlicms_${idx}`);
            const cstEl = document.getElementById(`cst_${idx}`);
            const vlissEl = document.getElementById(`vliss_${idx}`);
            const vlipiEl = document.getElementById(`vlipi_${idx}`);
            const vlpisEl = document.getElementById(`vlpis_${idx}`);
            const vlcofinsEl = document.getElementById(`vlcofins_${idx}`);

            const qtd = qtdEl ? (parseFloat(qtdEl.value) || 0.0) : it.quantidade;
            const totalVal = totalEl ? (parseFloat(totalEl.value) || 0.0) : it.total;
            const vdesc = vdescEl ? (parseFloat(vdescEl.value) || 0.0) : (it.valordesconto || 0.0);
            const vunitLiquid = qtd > 0 ? (totalVal / qtd) : (it.valorunitario || 0.0);

            const aliqdifEl = document.getElementById(`aliqdificms_${idx}`);

            return {
                cod_transacaoitem: it.cod_transacaoitem,
                cod_item: it.cod_item,
                descricao: descEl ? descEl.value.trim() : it.descricao,
                quantidade: qtd,
                valorunitario: vunitLiquid,
                total: totalVal,
                valordesconto: vdesc,
                cod_naturezaoperacao: natEl ? (natEl.value || null) : it.cod_naturezaoperacao,
                aliquotaicms: aliqEl ? (parseFloat(aliqEl.value) || 0.0) : it.aliquotaicms,
                aliquotaicmsdiferimento: aliqdifEl ? (parseFloat(aliqdifEl.value) || 0.0) : (it.aliquotaicmsdiferimento || 0.0),
                basecalculoicms: baseEl ? (parseFloat(baseEl.value) || 0.0) : it.basecalculoicms,
                totalicms: vlicmsEl ? (parseFloat(vlicmsEl.value) || 0.0) : it.totalicms,
                tributacaoicms: cstEl ? (cstEl.value.trim() || '00') : it.tributacaoicms,
                totalissqn: vlissEl ? (parseFloat(vlissEl.value) || 0.0) : (it.totalissqn || 0.0),
                totalipi: vlipiEl ? (parseFloat(vlipiEl.value) || 0.0) : (it.totalipi || 0.0),
                totalpis: vlpisEl ? (parseFloat(vlpisEl.value) || 0.0) : (it.totalpis || 0.0),
                totalcofins: vlcofinsEl ? (parseFloat(vlcofinsEl.value) || 0.0) : (it.totalcofins || 0.0),
                totalicmssubstituicao: parseFloat(it.totalicmssubstituicao) || 0.0
            };
        });

        const payload = {
            cod_ordemservico: currentOS.header.cod_ordemservico,
            cod_empresa: currentOS.header.cod_empresa,
            cod_naturezaoperacao: modalOperacaoFiscal.value || null,
            total_icms: modalTotalICMS ? (parseFloat(modalTotalICMS.value) || 0.0) : 0.0,
            total_issqn: modalTotalISSQN ? (parseFloat(modalTotalISSQN.value) || 0.0) : 0.0,
            total_ipi: modalTotalIPI ? (parseFloat(modalTotalIPI.value) || 0.0) : 0.0,
            total_pis: modalTotalPIS ? (parseFloat(modalTotalPIS.value) || 0.0) : 0.0,
            total_cofins: modalTotalCOFINS ? (parseFloat(modalTotalCOFINS.value) || 0.0) : 0.0,
            total_icms_st: modalTotalICMSST ? (parseFloat(modalTotalICMSST.value) || 0.0) : 0.0,
            total: parseFloat(modalTotalOS.value) || 0.0,
            valordesconto: parseFloat(modalValorDesconto.value) || 0.0,
            items: itemsPayload
        };

        const res = await fetch(`/api/os/${currentOS.header.cod_ordemservico}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Erro ao salvar OS.');
        }
        
        const result = await res.json();
        showToast(result.message, 'success');
        editModal.classList.add('hidden');
        searchOS(); // Refresh list to display updated values
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btnSaveOS.disabled = false;
        btnSaveOS.innerHTML = '<span>💾 Salvar Alterações no Banco</span>';
    }
}

// Event Listeners
dbSelect.addEventListener('change', handleDatabaseChange);
btnSearch.addEventListener('click', searchOS);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchOS();
});
if (osSearchClientInput) {
    osSearchClientInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchOS();
    });
}

btnRefreshStatus.addEventListener('click', checkStatus);
btnCloseModal.addEventListener('click', () => editModal.classList.add('hidden'));
btnCancelEdit.addEventListener('click', () => editModal.classList.add('hidden'));
btnRecalculate.addEventListener('click', recalculateAll);
btnSaveOS.addEventListener('click', saveOS);
modalValorDesconto.addEventListener('input', recalculateTotalsHeader);

// Client Report Functionality
let clientsList = [];

const tabOS = document.getElementById('tabOS');
const tabClientes = document.getElementById('tabClientes');
const tabProdutos = document.getElementById('tabProdutos');
const tabTopClientes = document.getElementById('tabTopClientes');
const tabClientesFamilia = document.getElementById('tabClientesFamilia');
const sectionOS = document.getElementById('sectionOS');
const sectionClientes = document.getElementById('sectionClientes');
const sectionProdutos = document.getElementById('sectionProdutos');
const sectionTopClientes = document.getElementById('sectionTopClientes');
const sectionClientesFamilia = document.getElementById('sectionClientesFamilia');

function switchActiveTab(activeBtn, activeSection) {
    [tabOS, tabClientes, tabProdutos, tabTopClientes, tabClientesFamilia].forEach(tab => {
        if (tab) tab.classList.remove('active');
    });
    [sectionOS, sectionClientes, sectionProdutos, sectionTopClientes, sectionClientesFamilia].forEach(sec => {
        if (sec) sec.classList.add('hidden');
    });

    if (activeBtn) activeBtn.classList.add('active');
    if (activeSection) activeSection.classList.remove('hidden');
}

if (tabOS) {
    tabOS.addEventListener('click', () => {
        switchActiveTab(tabOS, sectionOS);
    });
}

if (tabClientes) {
    tabClientes.addEventListener('click', () => {
        switchActiveTab(tabClientes, sectionClientes);
    });
}

if (tabProdutos) {
    tabProdutos.addEventListener('click', () => {
        switchActiveTab(tabProdutos, sectionProdutos);
        if (containerTiposOpCheckboxes && !containerTiposOpCheckboxes.children.length) {
            loadTiposOperacao();
        }
    });
}

if (tabTopClientes) {
    tabTopClientes.addEventListener('click', () => {
        switchActiveTab(tabTopClientes, sectionTopClientes);
        if (containerTopCustomerTiposOpCheckboxes && !containerTopCustomerTiposOpCheckboxes.children.length) {
            loadTopCustomerTiposOperacao();
        }
        if (topCustomersList.length === 0) {
            loadTopCustomersReport();
        }
    });
}

if (tabClientesFamilia) {
    tabClientesFamilia.addEventListener('click', () => {
        switchActiveTab(tabClientesFamilia, sectionClientesFamilia);
        if (containerFamiliaTiposOpCheckboxes && !containerFamiliaTiposOpCheckboxes.children.length) {
            loadFamiliaTiposOperacao();
        }
    });
}

// Function to navigate to OS Tab and search OS records for a specific client
function filterOSByClient(codPessoa, clientName) {
    if (!tabOS || !sectionOS) return;
    
    // Switch active tab to OS
    switchActiveTab(tabOS, sectionOS);
    
    // Set selected client in search input and global state
    selectedSearchCodPessoa = codPessoa;
    if (osSearchClientInput) {
        osSearchClientInput.value = `Cód: ${codPessoa} - ${clientName}`;
    }
    if (btnClearClientSearch) {
        btnClearClientSearch.classList.remove('hidden');
    }
    
    // Clear general text search if filled
    if (searchInput) {
        searchInput.value = '';
    }

    // Preserve Date Filter from report if available
    let dtIni = '';
    let dtFim = '';

    const topIni = document.getElementById('topCustomerDateInicio');
    const topFim = document.getElementById('topCustomerDateFim');
    const prodIni = document.getElementById('productDateInicio');
    const prodFim = document.getElementById('productDateFim');

    if (topIni && topIni.value) dtIni = topIni.value;
    else if (prodIni && prodIni.value) dtIni = prodIni.value;

    if (topFim && topFim.value) dtFim = topFim.value;
    else if (prodFim && prodFim.value) dtFim = prodFim.value;

    if (osDateInicio) osDateInicio.value = dtIni;
    if (osDateFim) osDateFim.value = dtFim;

    // Set Limit to 0 (Todos os Registros / Sem Limite) to bring all OS records searched
    if (limitSelect) {
        limitSelect.value = '0';
    }
    
    // Scroll smoothly to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Execute OS search
    searchOS();
    
    const periodMsg = (dtIni || dtFim) ? ` (${dtIni || 'Início'} a ${dtFim || 'Hoje'})` : '';
    showToast(`Exibindo todas as OS do cliente: ${clientName}${periodMsg}`, 'info');
}

window.filterOSByClient = filterOSByClient;

const clientSearchInput = document.getElementById('clientSearchInput');
const clientTypeSelect = document.getElementById('clientTypeSelect');
const btnSearchClients = document.getElementById('btnSearchClients');
const btnPrintClients = document.getElementById('btnPrintClients');
const clientsTableBody = document.getElementById('clientsTableBody');
const clientResultCountBadge = document.getElementById('clientResultCountBadge');

const statTotalClients = document.getElementById('statTotalClients');
const statSimples = document.getElementById('statSimples');
const statMei = document.getElementById('statMei');
const statOutro = document.getElementById('statOutro');
const statNenhum = document.getElementById('statNenhum');
const printDate = document.getElementById('printDate');
const printFilter = document.getElementById('printFilter');

// Load Client Report Data
async function loadClientsReport() {
    if (!btnSearchClients) return;
    
    btnSearchClients.disabled = true;
    btnSearchClients.innerHTML = '<span>Carregando...</span>';
    
    try {
        const query = clientSearchInput ? clientSearchInput.value.trim() : '';
        const enq = clientTypeSelect ? clientTypeSelect.value : 'todos';
        
        let url = `/api/clientes?enquadramento=${encodeURIComponent(enq)}`;
        if (query) {
            url += `&search=${encodeURIComponent(query)}`;
        }
        
        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Erro ao carregar relatório de clientes.');
        }
        
        clientsList = await res.json();
        renderClientsTable(clientsList);
        updateClientStats(clientsList);
        updatePrintMeta();
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btnSearchClients.disabled = false;
        btnSearchClients.innerHTML = '<span>Filtrar</span>';
    }
}

// Render Clients Table
function renderClientsTable(list) {
    if (!clientsTableBody) return;
    
    clientResultCountBadge.textContent = `${list.length} encontrados`;
    
    if (list.length === 0) {
        clientsTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center empty-state">
                    Nenhum cliente ativo encontrado com os critérios informados.
                </td>
            </tr>
        `;
        return;
    }
    
    clientsTableBody.innerHTML = list.map(c => {
        let badgeClass = 'badge-blue';
        if (c.enquadramento_codigo === 3) badgeClass = 'badge-green'; // MEI
        else if (c.enquadramento_codigo === 1) badgeClass = 'badge-blue'; // Simples
        else if (c.enquadramento_codigo === 2) badgeClass = ''; // Outro
        else badgeClass = ''; // Nenhum
        
        const displayName = c.nome || c.razao_social || `Cliente ${c.cod_pessoa}`;
        const cleanName = escapeHtml(displayName).replace(/'/g, "\\'");
        
        return `
            <tr>
                <td>
                    <a href="#" class="client-os-link" onclick="event.preventDefault(); window.filterOSByClient('${c.cod_pessoa}', '${cleanName}');" title="Clique para carregar as Ordens de Serviço (OS) deste cliente">
                        <span class="link-icon">🔍</span>
                        <strong>${escapeHtml(displayName)}</strong>
                    </a>
                </td>
                <td>${escapeHtml(c.razao_social || 'N/A')}</td>
                <td><code>${escapeHtml(c.cnpj_cpf || 'N/A')}</code></td>
                <td>${escapeHtml(c.ie || 'ISENTO')}</td>
                <td class="text-center">
                    <span class="badge ${badgeClass}">
                        ${escapeHtml(c.enquadramento_descricao)}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

// Update Stats Bar
function updateClientStats(list) {
    if (!statTotalClients) return;
    
    let total = list.length;
    let simples = list.filter(c => c.enquadramento_codigo === 1).length;
    let mei = list.filter(c => c.enquadramento_codigo === 3).length;
    let outro = list.filter(c => c.enquadramento_codigo === 2).length;
    let nenhum = list.filter(c => c.enquadramento_codigo === 0).length;
    
    statTotalClients.textContent = total;
    if (statSimples) statSimples.textContent = simples;
    if (statMei) statMei.textContent = mei;
    if (statOutro) statOutro.textContent = outro;
    if (statNenhum) statNenhum.textContent = nenhum;
}

// Update Metadata for Printing
function updatePrintMeta() {
    if (!printDate) return;
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    printDate.textContent = `Data de Emissão: ${dateStr}`;
    
    if (clientTypeSelect && printFilter) {
        const selText = clientTypeSelect.options[clientTypeSelect.selectedIndex].text;
        const searchText = clientSearchInput ? clientSearchInput.value.trim() : '';
        let filterStr = `Filtro: ${selText}`;
        if (searchText) {
            filterStr += ` | Busca: "${searchText}"`;
        }
        printFilter.textContent = filterStr;
    }
}

// Print Action (Triggers Browser Print Dialog for selecting physical or PDF printer)
if (btnPrintClients) {
    btnPrintClients.addEventListener('click', () => {
        updatePrintMeta();
        window.print();
    });
}

if (btnSearchClients) {
    btnSearchClients.addEventListener('click', loadClientsReport);
}

if (clientSearchInput) {
    clientSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadClientsReport();
    });
}

if (clientTypeSelect) {
    clientTypeSelect.addEventListener('change', loadClientsReport);
}

// ==========================================
// 🏆 PRODUTOS MAIS VENDIDOS REPORT & CHART
// ==========================================

let productsChartInstance = null;
let productsList = [];
let tiposOperacaoData = [];

const productSearchInput = document.getElementById('productSearchInput');
const productOrderSelect = document.getElementById('productOrderSelect');
const productTipoItemSelect = document.getElementById('productTipoItemSelect');
const productLimitSelect = document.getElementById('productLimitSelect');
const productDateInicio = document.getElementById('productDateInicio');
const productDateFim = document.getElementById('productDateFim');
const btnSearchProducts = document.getElementById('btnSearchProducts');
const btnPrintProducts = document.getElementById('btnPrintProducts');

// Multi-select elements
const btnTipoOpDropdown = document.getElementById('btnTipoOpDropdown');
const dropdownTipoOpList = document.getElementById('dropdownTipoOpList');
const containerTiposOpCheckboxes = document.getElementById('containerTiposOpCheckboxes');
const lblTipoOpSelected = document.getElementById('lblTipoOpSelected');
const btnSelectAllTipos = document.getElementById('btnSelectAllTipos');
const btnClearTipos = document.getElementById('btnClearTipos');

const statProductFaturamento = document.getElementById('statProductFaturamento');
const statProductQtd = document.getElementById('statProductQtd');
const statProductDistintos = document.getElementById('statProductDistintos');
const statProductTicket = document.getElementById('statProductTicket');

const chartCardTitle = document.getElementById('chartCardTitle');
const chartMetricBadge = document.getElementById('chartMetricBadge');
const productsTableBody = document.getElementById('productsTableBody');
const productResultCountBadge = document.getElementById('productResultCountBadge');

const productPrintDate = document.getElementById('productPrintDate');
const productPrintFilter = document.getElementById('productPrintFilter');

// Multi-select Dropdown Handlers
if (btnTipoOpDropdown && dropdownTipoOpList) {
    btnTipoOpDropdown.addEventListener('click', async (e) => {
        e.stopPropagation();
        dropdownTipoOpList.classList.toggle('hidden');
        if (containerTiposOpCheckboxes && !containerTiposOpCheckboxes.children.length) {
            await loadTiposOperacao();
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#tipoOpMultiSelect')) {
            dropdownTipoOpList.classList.add('hidden');
        }
    });
}

// Get selected Tipos values
function getSelectedTiposOperacao() {
    if (!containerTiposOpCheckboxes) return [];
    const checked = containerTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => cb.value);
}

// Update Dropdown Button Text
function updateTipoOpLabel() {
    if (!lblTipoOpSelected || !containerTiposOpCheckboxes) return;
    const allCbs = containerTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]');
    const checkedCbs = containerTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
    
    if (checkedCbs.length === 0) {
        lblTipoOpSelected.textContent = '🛒 Vendas';
    } else if (checkedCbs.length === allCbs.length) {
        lblTipoOpSelected.textContent = '🌐 Todos os Tipos';
    } else if (checkedCbs.length === 1) {
        const item = tiposOperacaoData.find(t => String(t.tipo) === checkedCbs[0].value);
        lblTipoOpSelected.textContent = item ? item.descricao : `1 Tipo Selecionado`;
    } else if (checkedCbs.length === 2 && Array.from(checkedCbs).every(c => c.value === '1' || c.value === '11')) {
        lblTipoOpSelected.textContent = '🛒 Vendas';
    } else {
        lblTipoOpSelected.textContent = `🏷️ ${checkedCbs.length} Tipos Selecionados`;
    }
}

if (btnSelectAllTipos && containerTiposOpCheckboxes) {
    btnSelectAllTipos.addEventListener('click', () => {
        containerTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
        updateTipoOpLabel();
    });
}

if (btnClearTipos && containerTiposOpCheckboxes) {
    btnClearTipos.addEventListener('click', () => {
        containerTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        updateTipoOpLabel();
    });
}

// Load Fiscal Operation Types
async function loadTiposOperacao() {
    if (!containerTiposOpCheckboxes) return;
    try {
        const res = await fetch('/api/tipos-natureza');
        if (!res.ok) return;
        tiposOperacaoData = await res.json();
        
        containerTiposOpCheckboxes.innerHTML = '';
        tiposOperacaoData.forEach(t => {
            const label = document.createElement('label');
            label.className = 'checkbox-option';
            const isVendaDefault = (t.tipo === 1 || t.tipo === 11);
            label.innerHTML = `
                <input type="checkbox" value="${t.tipo}" ${isVendaDefault ? 'checked' : ''}>
                <span>${escapeHtml(t.descricao)}</span>
            `;
            const cb = label.querySelector('input');
            cb.addEventListener('change', updateTipoOpLabel);
            containerTiposOpCheckboxes.appendChild(label);
        });

        updateTipoOpLabel();
    } catch (e) {
        console.error('Erro ao carregar tipos de operação:', e);
    }
}

// Load Top Selling Products
async function loadProductsReport() {
    if (!btnSearchProducts) return;

    btnSearchProducts.disabled = true;
    btnSearchProducts.innerHTML = '<span>Carregando...</span>';

    try {
        const order = productOrderSelect ? productOrderSelect.value : 'valor';
        const selectedTipos = getSelectedTiposOperacao();
        const tipoItem = productTipoItemSelect ? productTipoItemSelect.value : 'todos';
        const limit = productLimitSelect ? productLimitSelect.value : '20';
        const search = productSearchInput ? productSearchInput.value.trim() : '';
        const dtIni = productDateInicio ? productDateInicio.value : '';
        const dtFim = productDateFim ? productDateFim.value : '';

        let url = `/api/produtos/mais-vendidos?ordenar_por=${encodeURIComponent(order)}&limit=${encodeURIComponent(limit)}&tipo_item=${encodeURIComponent(tipoItem)}`;
        if (selectedTipos.length > 0) {
            url += `&tipo_operacao=${encodeURIComponent(selectedTipos.join(','))}`;
        }
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (dtIni) url += `&data_inicio=${encodeURIComponent(dtIni)}`;
        if (dtFim) url += `&data_fim=${encodeURIComponent(dtFim)}`;

        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Erro ao buscar relatório de produtos mais vendidos.');
        }

        const data = await res.json();
        productsList = data.items || [];

        updateProductStats(data);
        renderProductsChart(data);
        renderProductsTable(data.items, order);
        updateProductPrintMeta(data);
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btnSearchProducts.disabled = false;
        btnSearchProducts.innerHTML = '<span>Filtrar</span>';
    }
}

// Update Stats Cards
function updateProductStats(data) {
    if (statProductFaturamento) statProductFaturamento.textContent = `R$ ${formatMoney(data.total_faturamento)}`;
    if (statProductQtd) statProductQtd.textContent = (data.total_quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    if (statProductDistintos) statProductDistintos.textContent = data.total_produtos_distintos || 0;
    if (statProductTicket) statProductTicket.textContent = `R$ ${formatMoney(data.ticket_medio_item)}`;
}

// Render Dynamic Horizontal Bar Chart via Chart.js
function renderProductsChart(data) {
    const canvas = document.getElementById('productsChart');
    if (!canvas) return;

    if (productsChartInstance) {
        productsChartInstance.destroy();
        productsChartInstance = null;
    }

    const items = (data.items || []).slice(0, 15); // Show top 15 in chart for clean visualization
    const isByQuantity = data.ordenar_por === 'quantidade';

    if (chartCardTitle) {
        chartCardTitle.textContent = isByQuantity 
            ? '📊 Top Produtos por Quantidade Vendida' 
            : '📊 Top Produtos por Faturamento (R$)';
    }

    if (chartMetricBadge) {
        chartMetricBadge.textContent = isByQuantity 
            ? 'Métrica: Quantidade (Unidades)' 
            : 'Métrica: Valor Total (R$)';
        chartMetricBadge.className = isByQuantity ? 'badge badge-green' : 'badge badge-blue';
    }

    if (items.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const labels = items.map(item => {
        const desc = item.descricao || `Item ${item.cod_item}`;
        return desc.length > 28 ? desc.substring(0, 26) + '...' : desc;
    });

    const chartValues = items.map(item => isByQuantity ? item.quantidade : item.valor_total);

    const barColor = isByQuantity ? '#10b981' : '#3b82f6';
    const barHoverColor = isByQuantity ? '#059669' : '#2563eb';

    const ctx = canvas.getContext('2d');
    productsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: isByQuantity ? 'Quantidade Vendida (Unidades)' : 'Total Faturado (R$)',
                data: chartValues,
                backgroundColor: barColor,
                hoverBackgroundColor: barHoverColor,
                borderRadius: 6,
                borderSkipped: false,
                barThickness: 18
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            const index = context[0].dataIndex;
                            return `${items[index].cod_item} - ${items[index].descricao}`;
                        },
                        label: function(context) {
                            const val = context.raw;
                            if (isByQuantity) {
                                return ` Quantidade: ${val.toLocaleString('pt-BR')} unidades`;
                            } else {
                                return ` Faturamento: R$ ${formatMoney(val)}`;
                            }
                        },
                        afterLabel: function(context) {
                            const index = context.dataIndex;
                            const item = items[index];
                            if (isByQuantity) {
                                return ` Faturamento: R$ ${formatMoney(item.valor_total)} (${item.qtd_vendas} vendas)`;
                            } else {
                                return ` Quantidade: ${item.quantidade.toLocaleString('pt-BR')} un. (${item.qtd_vendas} vendas)`;
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.06)'
                    },
                    ticks: {
                        color: '#94a3b8',
                        callback: function(value) {
                            if (isByQuantity) {
                                return value >= 1000 ? (value / 1000) + 'k' : value;
                            } else {
                                return 'R$ ' + (value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value);
                            }
                        }
                    }
                },
                y: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#cbd5e1',
                        font: {
                            size: 11,
                            weight: '500'
                        }
                    }
                }
            }
        }
    });
}

// Render Products Table
function renderProductsTable(items, orderMetric) {
    if (!productsTableBody) return;

    if (productResultCountBadge) {
        productResultCountBadge.textContent = `${items.length} produtos exibidos`;
    }

    if (!items || items.length === 0) {
        productsTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center empty-state">
                    Nenhum produto vendido encontrado com os critérios selecionados.
                </td>
            </tr>
        `;
        return;
    }

    const isByQuantity = orderMetric === 'quantidade';

    productsTableBody.innerHTML = items.map((item, idx) => {
        const rank = item.ranking || (idx + 1);
        let rankBadgeClass = 'rank-badge';
        if (rank === 1) rankBadgeClass += ' rank-1';
        else if (rank === 2) rankBadgeClass += ' rank-2';
        else if (rank === 3) rankBadgeClass += ' rank-3';

        const highlightValClass = !isByQuantity ? 'style="font-weight: 700; color: #60a5fa;"' : '';
        const highlightQtdClass = isByQuantity ? 'style="font-weight: 700; color: #34d399;"' : '';

        return `
            <tr>
                <td class="text-center">
                    <span class="${rankBadgeClass}">${rank}</span>
                </td>
                <td><code>${escapeHtml(item.cod_item)}</code></td>
                <td><strong>${escapeHtml(item.descricao)}</strong></td>
                <td class="text-right" ${highlightQtdClass}>
                    ${item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                </td>
                <td class="text-right">
                    R$ ${formatMoney(item.preco_medio)}
                </td>
                <td class="text-right" ${highlightValClass}>
                    R$ ${formatMoney(item.valor_total)}
                </td>
                <td class="text-center">
                    <span class="badge badge-blue">${item.qtd_vendas}</span>
                </td>
            </tr>
        `;
    }).join('');
}

// Update Print Metadata for Products
function updateProductPrintMeta(data) {
    if (!productPrintDate) return;
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    productPrintDate.textContent = `Emissão: ${dateStr}`;

    if (productPrintFilter) {
        const orderText = productOrderSelect ? productOrderSelect.options[productOrderSelect.selectedIndex].text : 'Valor';
        const tipoItemText = productTipoItemSelect ? productTipoItemSelect.options[productTipoItemSelect.selectedIndex].text : 'Ambos';
        const tipoOpText = lblTipoOpSelected ? lblTipoOpSelected.textContent : 'Todos os Tipos';
        const limitText = productLimitSelect ? productLimitSelect.options[productLimitSelect.selectedIndex].text : 'Top 20';
        const searchText = productSearchInput ? productSearchInput.value.trim() : '';

        let filterStr = `Filtro: ${orderText} | ${tipoItemText} | Operação: ${tipoOpText} | ${limitText}`;
        if (searchText) filterStr += ` | Busca: "${searchText}"`;
        productPrintFilter.textContent = filterStr;
    }
}

// Print Action for Products
if (btnPrintProducts) {
    btnPrintProducts.addEventListener('click', () => {
        updateProductPrintMeta();
        window.print();
    });
}

if (btnSearchProducts) {
    btnSearchProducts.addEventListener('click', loadProductsReport);
}

if (productTipoItemSelect) {
    productTipoItemSelect.addEventListener('change', loadProductsReport);
}

if (productSearchInput) {
    productSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadProductsReport();
    });
}

// ==========================================
// 👥 CLIENTES QUE MAIS COMPRAM & GRÁFICO DE BOLHAS
// ==========================================

let topCustomerCityChartInstance = null;
let topCustomerBubbleChartInstance = null;
let topCustomersList = [];
let topCustomerTiposData = [];

const topCustomerSearchInput = document.getElementById('topCustomerSearchInput');
const topCustomerOrderSelect = document.getElementById('topCustomerOrderSelect');
const topCustomerTipoItemSelect = document.getElementById('topCustomerTipoItemSelect');
const topCustomerCitySelect = document.getElementById('topCustomerCitySelect');
const topCustomerLimitSelect = document.getElementById('topCustomerLimitSelect');
const topCustomerDateInicio = document.getElementById('topCustomerDateInicio');
const topCustomerDateFim = document.getElementById('topCustomerDateFim');
const btnSearchTopCustomers = document.getElementById('btnSearchTopCustomers');
const btnPrintTopCustomers = document.getElementById('btnPrintTopCustomers');

// Multi-select elements for Top Customers
const btnTopCustomerTipoOpDropdown = document.getElementById('btnTopCustomerTipoOpDropdown');
const dropdownTopCustomerTipoOpList = document.getElementById('dropdownTopCustomerTipoOpList');
const containerTopCustomerTiposOpCheckboxes = document.getElementById('containerTopCustomerTiposOpCheckboxes');
const lblTopCustomerTipoOpSelected = document.getElementById('lblTopCustomerTipoOpSelected');
const btnSelectVendasTopCustomerTipos = document.getElementById('btnSelectVendasTopCustomerTipos');
const btnSelectAllTopCustomerTipos = document.getElementById('btnSelectAllTopCustomerTipos');
const btnClearTopCustomerTipos = document.getElementById('btnClearTopCustomerTipos');

// Tipos de operação que representam vendas e faturamento de clientes:
// 1 (Vendas), 8 (Remessas e Serviços), 9 (Bonificação/Brindes), 10 (Industrialização), 11 (Vendas Entrega Futura), 12 (Venda de Ativo/Imobilizado)
const TOP_CUSTOMER_VENDA_TIPOS = [1, 8, 9, 10, 11, 12];

const statTopCustomerFaturamento = document.getElementById('statTopCustomerFaturamento');
const statTopCustomerQtd = document.getElementById('statTopCustomerQtd');
const statTopCustomerDistintos = document.getElementById('statTopCustomerDistintos');
const statTopCustomerCidades = document.getElementById('statTopCustomerCidades');
const statTopCustomerTicket = document.getElementById('statTopCustomerTicket');

const topCustomersTableBody = document.getElementById('topCustomersTableBody');
const topCustomerResultCountBadge = document.getElementById('topCustomerResultCountBadge');

const topCustomerPrintDate = document.getElementById('topCustomerPrintDate');
const topCustomerPrintFilter = document.getElementById('topCustomerPrintFilter');

// Multi-select Dropdown Event Handlers
if (btnTopCustomerTipoOpDropdown && dropdownTopCustomerTipoOpList) {
    btnTopCustomerTipoOpDropdown.addEventListener('click', async (e) => {
        e.stopPropagation();
        dropdownTopCustomerTipoOpList.classList.toggle('hidden');
        if (containerTopCustomerTiposOpCheckboxes && !containerTopCustomerTiposOpCheckboxes.children.length) {
            await loadTopCustomerTiposOperacao();
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#topCustomerTipoOpMultiSelect')) {
            dropdownTopCustomerTipoOpList.classList.add('hidden');
        }
    });
}

function getSelectedTopCustomerTipos() {
    if (!containerTopCustomerTiposOpCheckboxes) return [];
    const checked = containerTopCustomerTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => cb.value);
}

function updateTopCustomerTipoOpLabel() {
    if (!lblTopCustomerTipoOpSelected || !containerTopCustomerTiposOpCheckboxes) return;
    const allCbs = containerTopCustomerTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]');
    const checkedCbs = containerTopCustomerTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
    const checkedVals = Array.from(checkedCbs).map(c => parseInt(c.value, 10));
    
    const isExactVendas = checkedVals.length === TOP_CUSTOMER_VENDA_TIPOS.length && 
                          TOP_CUSTOMER_VENDA_TIPOS.every(v => checkedVals.includes(v));

    if (checkedCbs.length === 0) {
        lblTopCustomerTipoOpSelected.textContent = '🛒 Todas as Vendas';
    } else if (checkedCbs.length === allCbs.length) {
        lblTopCustomerTipoOpSelected.textContent = '🌐 Todos os Tipos';
    } else if (isExactVendas) {
        lblTopCustomerTipoOpSelected.textContent = '🛒 Todas as Vendas (Vendas, Serviços, Ind.)';
    } else if (checkedCbs.length === 1) {
        const item = topCustomerTiposData.find(t => String(t.tipo) === checkedCbs[0].value);
        lblTopCustomerTipoOpSelected.textContent = item ? item.descricao : `1 Tipo Selecionado`;
    } else {
        lblTopCustomerTipoOpSelected.textContent = `🏷️ ${checkedCbs.length} Tipos Selecionados`;
    }
}

if (btnSelectVendasTopCustomerTipos && containerTopCustomerTiposOpCheckboxes) {
    btnSelectVendasTopCustomerTipos.addEventListener('click', () => {
        containerTopCustomerTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            const val = parseInt(cb.value, 10);
            cb.checked = TOP_CUSTOMER_VENDA_TIPOS.includes(val);
        });
        updateTopCustomerTipoOpLabel();
    });
}

if (btnSelectAllTopCustomerTipos && containerTopCustomerTiposOpCheckboxes) {
    btnSelectAllTopCustomerTipos.addEventListener('click', () => {
        containerTopCustomerTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
        updateTopCustomerTipoOpLabel();
    });
}

if (btnClearTopCustomerTipos && containerTopCustomerTiposOpCheckboxes) {
    btnClearTopCustomerTipos.addEventListener('click', () => {
        containerTopCustomerTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        updateTopCustomerTipoOpLabel();
    });
}

// Load Cities List to Populate Select
async function loadCidades() {
    if (!topCustomerCitySelect) return;
    try {
        const res = await fetch('/api/cidades');
        if (!res.ok) return;
        const cidades = await res.json();
        
        topCustomerCitySelect.innerHTML = '<option value="todas" selected>🌐 Todas as Cidades</option>';
        cidades.forEach(cid => {
            const opt = document.createElement('option');
            opt.value = cid;
            opt.textContent = cid;
            topCustomerCitySelect.appendChild(opt);
        });
    } catch (e) {
        console.error('Erro ao carregar lista de cidades:', e);
    }
}

// Load Top Customer Types in Multi-select
async function loadTopCustomerTiposOperacao() {
    if (!containerTopCustomerTiposOpCheckboxes) return;
    try {
        if (!containerTopCustomerTiposOpCheckboxes.children.length) {
            containerTopCustomerTiposOpCheckboxes.innerHTML = '<div style="padding: 8px; color: #94a3b8; font-size: 0.8rem;">Carregando operações...</div>';
        }
        const res = await fetch('/api/tipos-natureza');
        if (!res.ok) return;
        topCustomerTiposData = await res.json();
        if (!Array.isArray(topCustomerTiposData)) return;
        
        containerTopCustomerTiposOpCheckboxes.innerHTML = '';
        topCustomerTiposData.forEach(t => {
            const label = document.createElement('label');
            label.className = 'checkbox-option';
            const isVendaDefault = TOP_CUSTOMER_VENDA_TIPOS.includes(t.tipo);
            label.innerHTML = `
                <input type="checkbox" value="${t.tipo}" ${isVendaDefault ? 'checked' : ''}>
                <span>${escapeHtml(t.descricao)}</span>
            `;
            const cb = label.querySelector('input');
            cb.addEventListener('change', updateTopCustomerTipoOpLabel);
            containerTopCustomerTiposOpCheckboxes.appendChild(label);
        });

        updateTopCustomerTipoOpLabel();
    } catch (e) {
        console.error('Erro ao carregar tipos de operação para clientes:', e);
    }
}

// Main Load Function for Top Customers Report
async function loadTopCustomersReport() {
    if (!btnSearchTopCustomers) return;

    btnSearchTopCustomers.disabled = true;
    btnSearchTopCustomers.innerHTML = '<span>Carregando...</span>';

    try {
        const order = topCustomerOrderSelect ? topCustomerOrderSelect.value : 'valor';
        const selectedTipos = getSelectedTopCustomerTipos();
        const tipoItem = topCustomerTipoItemSelect ? topCustomerTipoItemSelect.value : 'todos';
        const city = topCustomerCitySelect ? topCustomerCitySelect.value : 'todas';
        const limit = topCustomerLimitSelect ? topCustomerLimitSelect.value : '20';
        const search = topCustomerSearchInput ? topCustomerSearchInput.value.trim() : '';
        const dtIni = topCustomerDateInicio ? topCustomerDateInicio.value : '';
        const dtFim = topCustomerDateFim ? topCustomerDateFim.value : '';

        let url = `/api/clientes/mais-compraram?ordenar_por=${encodeURIComponent(order)}&limit=${encodeURIComponent(limit)}&tipo_item=${encodeURIComponent(tipoItem)}`;
        if (selectedTipos.length > 0) url += `&tipo_operacao=${encodeURIComponent(selectedTipos.join(','))}`;
        if (city && city !== 'todas') url += `&cidade=${encodeURIComponent(city)}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (dtIni) url += `&data_inicio=${encodeURIComponent(dtIni)}`;
        if (dtFim) url += `&data_fim=${encodeURIComponent(dtFim)}`;

        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Erro ao buscar relatório de clientes que mais compraram.');
        }

        const data = await res.json();
        topCustomersList = data.items || [];

        updateTopCustomerStats(data);
        renderCustomerCityChart(data);
        renderCustomerBubbleChart(data);
        renderTopCustomersTable(data.items, order);
        updateTopCustomerPrintMeta(data);
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        btnSearchTopCustomers.disabled = false;
        btnSearchTopCustomers.innerHTML = '<span>Filtrar</span>';
    }
}

// Update Top Customer Stat Cards
function updateTopCustomerStats(data) {
    if (statTopCustomerFaturamento) statTopCustomerFaturamento.textContent = `R$ ${formatMoney(data.total_faturamento)}`;
    if (statTopCustomerQtd) statTopCustomerQtd.textContent = (data.total_quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    if (statTopCustomerDistintos) statTopCustomerDistintos.textContent = data.total_clientes_distintos || 0;
    if (statTopCustomerCidades) statTopCustomerCidades.textContent = data.total_cidades || 0;
    if (statTopCustomerTicket) statTopCustomerTicket.textContent = `R$ ${formatMoney(data.ticket_medio_cliente)}`;
}

// Render Bar Chart per City
function renderCustomerCityChart(data) {
    const canvas = document.getElementById('topCustomerCityChartCanvas');
    if (!canvas) return;

    if (topCustomerCityChartInstance) {
        topCustomerCityChartInstance.destroy();
        topCustomerCityChartInstance = null;
    }

    const cities = (data.cidades_agrupadas || []).slice(0, 10);
    const isByQuantity = data.ordenar_por === 'quantidade';

    if (cities.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const labels = cities.map(c => c.cidade);
    const chartValues = cities.map(c => isByQuantity ? c.quantidade : c.faturamento);

    const barColor = isByQuantity ? '#10b981' : '#3b82f6';

    const ctx = canvas.getContext('2d');
    topCustomerCityChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: isByQuantity ? 'Qtd Produtos Vendidos' : 'Faturamento Total (R$)',
                data: chartValues,
                backgroundColor: barColor,
                borderRadius: 6,
                barThickness: 20
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw;
                            return isByQuantity 
                                ? ` Qtd Produtos: ${val.toLocaleString('pt-BR')} un.` 
                                : ` Faturamento: R$ ${formatMoney(val)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#cbd5e1', font: { size: 11 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.06)' },
                    ticks: {
                        color: '#94a3b8',
                        callback: function(val) {
                            return isByQuantity 
                                ? (val >= 1000 ? (val/1000) + 'k' : val) 
                                : 'R$ ' + (val >= 1000 ? (val/1000).toFixed(0) + 'k' : val);
                        }
                    }
                }
            }
        }
    });
}

// Render Interactive Bubble Chart (Concentration per City)
function renderCustomerBubbleChart(data) {
    const canvas = document.getElementById('topCustomerBubbleChartCanvas');
    if (!canvas) return;

    if (topCustomerBubbleChartInstance) {
        topCustomerBubbleChartInstance.destroy();
        topCustomerBubbleChartInstance = null;
    }

    const cities = (data.cidades_agrupadas || []).slice(0, 25);
    if (cities.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const maxFat = Math.max(...cities.map(c => c.faturamento), 1);
    
    // Bubble data points: x = Qtd Clientes, y = Faturamento (R$), r = size
    const bubblePoints = cities.map(c => {
        const radius = Math.max(8, Math.min(35, (c.faturamento / maxFat) * 32));
        return {
            x: c.qtd_clientes,
            y: c.faturamento,
            r: radius,
            cidadeName: c.cidade,
            qtdClientes: c.qtd_clientes,
            faturamento: c.faturamento,
            quantidade: c.quantidade,
            qtdTransacoes: c.qtd_transacoes
        };
    });

    const ctx = canvas.getContext('2d');
    topCustomerBubbleChartInstance = new Chart(ctx, {
        type: 'bubble',
        data: {
            datasets: [{
                label: 'Cidades',
                data: bubblePoints,
                backgroundColor: 'rgba(59, 130, 246, 0.6)',
                borderColor: '#3b82f6',
                borderWidth: 2,
                hoverBackgroundColor: 'rgba(16, 185, 129, 0.8)',
                hoverBorderColor: '#10b981'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: function(e, activeElements) {
                // Interactive Bubble Click: Filter by clicked city!
                if (activeElements && activeElements.length > 0) {
                    const elIndex = activeElements[0].index;
                    const clickedPoint = bubblePoints[elIndex];
                    const cityName = clickedPoint.cidadeName;
                    
                    if (cityName && topCustomerCitySelect) {
                        topCustomerCitySelect.value = cityName;
                        showToast(`Filtrando clientes da cidade: ${cityName}`, 'info');
                        loadTopCustomersReport();
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            const pt = context[0].raw;
                            return `🏙️ Cidade: ${pt.cidadeName}`;
                        },
                        label: function(context) {
                            const pt = context.raw;
                            return [
                                ` 👥 Clientes Distintos: ${pt.qtdClientes}`,
                                ` 💰 Faturamento Total: R$ ${formatMoney(pt.faturamento)}`,
                                ` 📦 Qtd Produtos: ${pt.quantidade.toLocaleString('pt-BR')} un.`,
                                ` 📄 Nº Transações: ${pt.qtdTransacoes}`,
                                ` 👆 Clique na bolha para filtrar esta cidade!`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Quantidade de Clientes Distintos', color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.06)' },
                    ticks: { color: '#cbd5e1' }
                },
                y: {
                    title: { display: true, text: 'Faturamento Total (R$)', color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.06)' },
                    ticks: {
                        color: '#94a3b8',
                        callback: function(val) {
                            return 'R$ ' + (val >= 1000 ? (val/1000).toFixed(0) + 'k' : val);
                        }
                    }
                }
            }
        }
    });
}

// Render Top Customers Table
function renderTopCustomersTable(items, orderMetric) {
    if (!topCustomersTableBody) return;

    if (topCustomerResultCountBadge) {
        topCustomerResultCountBadge.textContent = `${items.length} clientes exibidos`;
    }

    if (!items || items.length === 0) {
        topCustomersTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center empty-state">
                    Nenhum cliente encontrado com os critérios selecionados.
                </td>
            </tr>
        `;
        return;
    }

    const isByQuantity = orderMetric === 'quantidade';

    topCustomersTableBody.innerHTML = items.map((item, idx) => {
        const rank = item.ranking || (idx + 1);
        let rankBadgeClass = 'rank-badge';
        if (rank === 1) rankBadgeClass += ' rank-1';
        else if (rank === 2) rankBadgeClass += ' rank-2';
        else if (rank === 3) rankBadgeClass += ' rank-3';

        const highlightValClass = !isByQuantity ? 'style="font-weight: 700; color: #60a5fa;"' : '';
        const highlightQtdClass = isByQuantity ? 'style="font-weight: 700; color: #34d399;"' : '';

        const displayName = item.nome_fantasia || item.nome_cliente || `Cliente ${item.cod_pessoa}`;
        const cleanName = escapeHtml(displayName).replace(/'/g, "\\'");

        return `
            <tr>
                <td class="text-center">
                    <span class="${rankBadgeClass}">${rank}</span>
                </td>
                <td><code>${escapeHtml(item.cod_pessoa)}</code></td>
                <td>
                    <a href="#" class="client-os-link" onclick="event.preventDefault(); window.filterOSByClient('${item.cod_pessoa}', '${cleanName}');" title="Clique para carregar as Ordens de Serviço (OS) deste cliente">
                        <span class="link-icon">🔍</span>
                        <strong>${escapeHtml(displayName)}</strong>
                    </a>
                    ${item.razao_social && item.razao_social !== displayName ? `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-left: 1.5rem; margin-top: 1px;">${escapeHtml(item.razao_social)}</div>` : ''}
                </td>
                <td><span class="badge badge-blue">${escapeHtml(item.cidade)}</span></td>
                <td><code>${escapeHtml(item.documento || 'N/A')}</code></td>
                <td class="text-right" ${highlightQtdClass}>
                    ${item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                </td>
                <td class="text-right">
                    R$ ${formatMoney(item.preco_medio_item)}
                </td>
                <td class="text-right" ${highlightValClass}>
                    R$ ${formatMoney(item.valor_total)}
                </td>
                <td class="text-center">
                    <span class="badge">${item.qtd_compras}</span>
                </td>
            </tr>
        `;
    }).join('');
}

// Update Top Customer Print Metadata
function updateTopCustomerPrintMeta(data) {
    if (!topCustomerPrintDate) return;
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    topCustomerPrintDate.textContent = `Emissão: ${dateStr}`;

    if (topCustomerPrintFilter) {
        const orderText = topCustomerOrderSelect ? topCustomerOrderSelect.options[topCustomerOrderSelect.selectedIndex].text : 'Valor';
        const tipoItemText = topCustomerTipoItemSelect ? topCustomerTipoItemSelect.options[topCustomerTipoItemSelect.selectedIndex].text : 'Ambos';
        const tipoOpText = lblTopCustomerTipoOpSelected ? lblTopCustomerTipoOpSelected.textContent : 'Todos os Tipos';
        const cityText = topCustomerCitySelect ? topCustomerCitySelect.options[topCustomerCitySelect.selectedIndex].text : 'Todas as Cidades';
        const limitText = topCustomerLimitSelect ? topCustomerLimitSelect.options[topCustomerLimitSelect.selectedIndex].text : 'Top 20';
        const searchText = topCustomerSearchInput ? topCustomerSearchInput.value.trim() : '';

        let filterStr = `Filtro: ${orderText} | ${tipoItemText} | Cidade: ${cityText} | Operação: ${tipoOpText} | ${limitText}`;
        if (searchText) filterStr += ` | Busca: "${searchText}"`;
        topCustomerPrintFilter.textContent = filterStr;
    }
}

// Bind Top Customer Buttons & Listeners
if (btnPrintTopCustomers) {
    btnPrintTopCustomers.addEventListener('click', () => {
        updateTopCustomerPrintMeta();
        window.print();
    });
}

if (btnSearchTopCustomers) {
    btnSearchTopCustomers.addEventListener('click', loadTopCustomersReport);
}

if (topCustomerTipoItemSelect) {
    topCustomerTipoItemSelect.addEventListener('change', loadTopCustomersReport);
}

if (topCustomerSearchInput) {
    topCustomerSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadTopCustomersReport();
    });
}

// ==========================================
// 🛒 CLIENTES QUE COMPRARAM POR FAMÍLIA
// ==========================================

let familiaTiposData = [];
let clientesFamiliaList = [];
let currentModalItemsList = [];
let currentClientPurchasedData = null;

const familiaSearchInput = document.getElementById('familiaSearchInput');
const btnClearFamiliaSearch = document.getElementById('btnClearFamiliaSearch');
const familiaOrderSelect = document.getElementById('familiaOrderSelect');
const familiaLimitSelect = document.getElementById('familiaLimitSelect');
const familiaDateInicio = document.getElementById('familiaDateInicio');
const familiaDateFim = document.getElementById('familiaDateFim');
const btnSearchClientesFamilia = document.getElementById('btnSearchClientesFamilia');
const btnPrintClientesFamilia = document.getElementById('btnPrintClientesFamilia');

// Multi-select elements for Clientes que Compraram
const btnFamiliaTipoOpDropdown = document.getElementById('btnFamiliaTipoOpDropdown');
const dropdownFamiliaTipoOpList = document.getElementById('dropdownFamiliaTipoOpList');
const containerFamiliaTiposOpCheckboxes = document.getElementById('containerFamiliaTiposOpCheckboxes');
const lblFamiliaTipoOpSelected = document.getElementById('lblFamiliaTipoOpSelected');
const btnSelectVendasFamiliaTipos = document.getElementById('btnSelectVendasFamiliaTipos');
const btnSelectAllFamiliaTipos = document.getElementById('btnSelectAllFamiliaTipos');
const btnClearFamiliaTipos = document.getElementById('btnClearFamiliaTipos');

// Operações de venda para relatório de famílias/clientes
const FAMILIA_VENDA_TIPOS = [1, 8, 9, 10, 11, 12];

// Stats bar elements
const statFamiliaFaturamento = document.getElementById('statFamiliaFaturamento');
const statFamiliaQtd = document.getElementById('statFamiliaQtd');
const statFamiliaDistintos = document.getElementById('statFamiliaDistintos');
const statFamiliaTicket = document.getElementById('statFamiliaTicket');

// Table & Badges
const clientesFamiliaTableBody = document.getElementById('clientesFamiliaTableBody');
const familiaResultCountBadge = document.getElementById('familiaResultCountBadge');
const familiaPrintDate = document.getElementById('familiaPrintDate');
const familiaPrintFilter = document.getElementById('familiaPrintFilter');
const printClientesFamiliaContainer = document.getElementById('printClientesFamiliaContainer');
let currentClientesFamiliaData = null;

// Modal Elements - Famílias
const clientFamilyItemsModal = document.getElementById('clientFamilyItemsModal');
const btnCloseItemsModal = document.getElementById('btnCloseItemsModal');
const btnCancelItemsModal = document.getElementById('btnCancelItemsModal');
const modalItemsClientTitle = document.getElementById('modalItemsClientTitle');
const modalItemsClientSubtitle = document.getElementById('modalItemsClientSubtitle');
const modalClientContactInfo = document.getElementById('modalClientContactInfo');
const modalStatFaturamento = document.getElementById('modalStatFaturamento');
const modalStatQtd = document.getElementById('modalStatQtd');
const modalStatItens = document.getElementById('modalStatItens');
const modalStatTransacoes = document.getElementById('modalStatTransacoes');
const modalStatPrecoMedio = document.getElementById('modalStatPrecoMedio');
const modalItemsFilterInput = document.getElementById('modalItemsFilterInput');
const modalItemsCountBadge = document.getElementById('modalItemsCountBadge');
const btnPrintModalItems = document.getElementById('btnPrintModalItems');
const modalItemsTableBody = document.getElementById('modalItemsTableBody');
const printClientItemsContainer = document.getElementById('printClientItemsContainer');

// Modal Elements - Ordens de Serviço da Família
const familyOrdersModal = document.getElementById('familyOrdersModal');
const btnCloseFamilyOrdersModal = document.getElementById('btnCloseFamilyOrdersModal');
const btnCancelFamilyOrdersModal = document.getElementById('btnCancelFamilyOrdersModal');
const modalFamilyOrdersTitle = document.getElementById('modalFamilyOrdersTitle');
const modalFamilyOrdersSubtitle = document.getElementById('modalFamilyOrdersSubtitle');
const modalFamilyOrdersStatCount = document.getElementById('modalFamilyOrdersStatCount');
const modalFamilyOrdersStatFaturamento = document.getElementById('modalFamilyOrdersStatFaturamento');
const modalFamilyOrdersStatQtd = document.getElementById('modalFamilyOrdersStatQtd');
const modalFamilyOrdersStatPrecoMedio = document.getElementById('modalFamilyOrdersStatPrecoMedio');
const modalFamilyOrdersFilterInput = document.getElementById('modalFamilyOrdersFilterInput');
const modalFamilyOrdersCountBadge = document.getElementById('modalFamilyOrdersCountBadge');
const btnPrintFamilyOrders = document.getElementById('btnPrintFamilyOrders');
const modalFamilyOrdersTableBody = document.getElementById('modalFamilyOrdersTableBody');
const printFamilyOrdersContainer = document.getElementById('printFamilyOrdersContainer');

let currentFamilyOrdersData = null;
let currentFamilyOrdersList = [];

// Multi-select Dropdown Event Handlers for Familia
if (btnFamiliaTipoOpDropdown && dropdownFamiliaTipoOpList) {
    btnFamiliaTipoOpDropdown.addEventListener('click', async (e) => {
        e.stopPropagation();
        dropdownFamiliaTipoOpList.classList.toggle('hidden');
        if (containerFamiliaTiposOpCheckboxes && !containerFamiliaTiposOpCheckboxes.children.length) {
            await loadFamiliaTiposOperacao();
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#familiaTipoOpMultiSelect')) {
            dropdownFamiliaTipoOpList.classList.add('hidden');
        }
    });
}

function getSelectedFamiliaTipos() {
    if (!containerFamiliaTiposOpCheckboxes) return [];
    const checked = containerFamiliaTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => cb.value);
}

function updateFamiliaTipoOpLabel() {
    if (!lblFamiliaTipoOpSelected || !containerFamiliaTiposOpCheckboxes) return;
    const allCbs = containerFamiliaTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]');
    const checkedCbs = containerFamiliaTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
    const checkedVals = Array.from(checkedCbs).map(c => parseInt(c.value, 10));
    
    const isExactVendas = checkedVals.length === FAMILIA_VENDA_TIPOS.length && 
                          FAMILIA_VENDA_TIPOS.every(v => checkedVals.includes(v));

    if (checkedCbs.length === 0) {
        lblFamiliaTipoOpSelected.textContent = '🛒 Todas as Vendas';
    } else if (checkedCbs.length === allCbs.length) {
        lblFamiliaTipoOpSelected.textContent = '🌐 Todos os Tipos';
    } else if (isExactVendas) {
        lblFamiliaTipoOpSelected.textContent = '🛒 Todas as Vendas (Vendas, Serviços, Ind.)';
    } else if (checkedCbs.length === 1) {
        const item = Array.isArray(familiaTiposData) ? familiaTiposData.find(t => String(t.tipo) === checkedCbs[0].value) : null;
        lblFamiliaTipoOpSelected.textContent = item ? item.descricao : `1 Tipo Selecionado`;
    } else {
        lblFamiliaTipoOpSelected.textContent = `🏷️ ${checkedCbs.length} Tipos Selecionados`;
    }
}

if (btnSelectVendasFamiliaTipos && containerFamiliaTiposOpCheckboxes) {
    btnSelectVendasFamiliaTipos.addEventListener('click', () => {
        containerFamiliaTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            const val = parseInt(cb.value, 10);
            cb.checked = FAMILIA_VENDA_TIPOS.includes(val);
        });
        updateFamiliaTipoOpLabel();
    });
}

if (btnSelectAllFamiliaTipos && containerFamiliaTiposOpCheckboxes) {
    btnSelectAllFamiliaTipos.addEventListener('click', () => {
        containerFamiliaTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
        updateFamiliaTipoOpLabel();
    });
}

if (btnClearFamiliaTipos && containerFamiliaTiposOpCheckboxes) {
    btnClearFamiliaTipos.addEventListener('click', () => {
        containerFamiliaTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        updateFamiliaTipoOpLabel();
    });
}

async function loadFamiliaTiposOperacao() {
    if (!containerFamiliaTiposOpCheckboxes) return;
    try {
        if (!containerFamiliaTiposOpCheckboxes.children.length) {
            containerFamiliaTiposOpCheckboxes.innerHTML = '<div style="padding: 8px; color: #94a3b8; font-size: 0.8rem;">Carregando operações...</div>';
        }
        const res = await fetch('/api/tipos-natureza');
        if (!res.ok) return;
        familiaTiposData = await res.json();
        if (!Array.isArray(familiaTiposData)) return;
        
        containerFamiliaTiposOpCheckboxes.innerHTML = familiaTiposData.map(t => {
            const isChecked = FAMILIA_VENDA_TIPOS.includes(t.tipo) ? 'checked' : '';
            return `
                <label class="checkbox-option">
                    <input type="checkbox" value="${t.tipo}" ${isChecked}>
                    <span>${escapeHtml(t.descricao)}</span>
                </label>
            `;
        }).join('');

        containerFamiliaTiposOpCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', updateFamiliaTipoOpLabel);
        });

        updateFamiliaTipoOpLabel();
    } catch (e) {
        console.error('Erro ao carregar tipos de operação para clientes por família:', e);
    }
}

// Input de Busca por Descrição / Código (NÃO pesquisa durante a digitação)
if (familiaSearchInput) {
    familiaSearchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (btnClearFamiliaSearch) {
            if (val) btnClearFamiliaSearch.classList.remove('hidden');
            else btnClearFamiliaSearch.classList.add('hidden');
        }
    });

    familiaSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            loadClientesFamiliaReport();
        }
    });
}

if (btnClearFamiliaSearch) {
    btnClearFamiliaSearch.addEventListener('click', () => {
        if (familiaSearchInput) {
            familiaSearchInput.value = '';
            familiaSearchInput.focus();
        }
        btnClearFamiliaSearch.classList.add('hidden');
    });
}

// Load Clientes que Compraram Report
async function loadClientesFamiliaReport() {
    const rawSearch = familiaSearchInput ? familiaSearchInput.value.trim() : '';
    if (!rawSearch) {
        showToast('Por favor, informe a descrição ou código do produto, lente ou família para pesquisar.', 'warning');
        if (familiaSearchInput) familiaSearchInput.focus();
        return;
    }

    const order = familiaOrderSelect ? familiaOrderSelect.value : 'valor';
    const limit = familiaLimitSelect ? familiaLimitSelect.value : '50';
    const dtIni = familiaDateInicio ? familiaDateInicio.value : '';
    const dtFim = familiaDateFim ? familiaDateFim.value : '';

    const selectedTipos = getSelectedFamiliaTipos();
    let tipoOpParam = '';
    if (selectedTipos.length === 0) {
        tipoOpParam = FAMILIA_VENDA_TIPOS.join(',');
    } else if (selectedTipos.length === familiaTiposData.length) {
        tipoOpParam = 'todos';
    } else {
        tipoOpParam = selectedTipos.join(',');
    }

    let url = `/api/clientes/compraram-familia?search=${encodeURIComponent(rawSearch)}&ordenar_por=${encodeURIComponent(order)}&limit=${encodeURIComponent(limit)}`;
    if (tipoOpParam) {
        url += `&tipo_operacao=${encodeURIComponent(tipoOpParam)}`;
    }
    if (dtIni) {
        url += `&data_inicio=${encodeURIComponent(dtIni)}`;
    }
    if (dtFim) {
        url += `&data_fim=${encodeURIComponent(dtFim)}`;
    }

    btnSearchClientesFamilia.disabled = true;
    btnSearchClientesFamilia.innerHTML = '<span>⏳ Consultando...</span>';

    try {
        if (clientesFamiliaTableBody) {
            clientesFamiliaTableBody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center empty-state">
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
                            <span>🔍 Buscando clientes que compraram esta família no banco de dados...</span>
                            <span style="font-size: 0.8rem; color: var(--text-secondary);">Isso pode levar alguns instantes dependendo do volume histórico.</span>
                        </div>
                    </td>
                </tr>
            `;
        }

        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Erro ao buscar clientes que compraram a família.');
        }

        const data = await res.json();
        clientesFamiliaList = data.items || [];
        currentClientesFamiliaData = data;

        updateFamiliaStats(data);
        renderClientesFamiliaTable(data.items, order, data.familia_pesquisada);
        updateFamiliaPrintMeta(data);
    } catch (e) {
        showToast(e.message, 'error');
        if (clientesFamiliaTableBody) {
            clientesFamiliaTableBody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center empty-state" style="color: #ef4444;">
                        Ocorreu um erro ao carregar os clientes: ${escapeHtml(e.message)}
                    </td>
                </tr>
            `;
        }
    } finally {
        btnSearchClientesFamilia.disabled = false;
        btnSearchClientesFamilia.innerHTML = '<span>Filtrar</span>';
    }
}

function updateFamiliaStats(data) {
    if (statFamiliaFaturamento) statFamiliaFaturamento.textContent = `R$ ${formatMoney(data.total_faturamento)}`;
    if (statFamiliaQtd) statFamiliaQtd.textContent = (data.total_quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    if (statFamiliaDistintos) statFamiliaDistintos.textContent = data.total_clientes_distintos || 0;
    if (statFamiliaTicket) statFamiliaTicket.textContent = `R$ ${formatMoney(data.ticket_medio_cliente)}`;
}

function renderClientesFamiliaTable(items, orderMetric, familiaPesquisada) {
    if (!clientesFamiliaTableBody) return;

    if (familiaResultCountBadge) {
        familiaResultCountBadge.textContent = `${items.length} clientes encontrados`;
    }

    if (!items || items.length === 0) {
        clientesFamiliaTableBody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center empty-state">
                    Nenhum cliente comprou produtos desta família no período e critérios selecionados.
                </td>
            </tr>
        `;
        return;
    }

    const isByQuantity = orderMetric === 'quantidade';

    clientesFamiliaTableBody.innerHTML = items.map((item, idx) => {
        const rank = item.ranking || (idx + 1);
        let rankBadgeClass = 'rank-badge';
        if (rank === 1) rankBadgeClass += ' rank-1';
        else if (rank === 2) rankBadgeClass += ' rank-2';
        else if (rank === 3) rankBadgeClass += ' rank-3';

        const highlightValClass = !isByQuantity ? 'style="font-weight: 700; color: #60a5fa;"' : '';
        const highlightQtdClass = isByQuantity ? 'style="font-weight: 700; color: #34d399;"' : '';
        const displayName = item.nome_fantasia || item.nome_cliente || `Cliente ${item.cod_pessoa}`;
        const cleanName = escapeHtml(displayName).replace(/'/g, "\\'");

        return `
            <tr class="clickable-row" onclick="window.openClientFamilyItemsModal(${item.cod_pessoa}, '${cleanName}');" title="Clique para ver as famílias compradas por este cliente">
                <td class="text-center">
                    <span class="${rankBadgeClass}">${rank}</span>
                </td>
                <td><code>${escapeHtml(item.cod_pessoa)}</code></td>
                <td>
                    <span class="client-family-link">
                        <span>📦</span>
                        <strong>${escapeHtml(displayName)}</strong>
                    </span>
                    ${item.razao_social && item.razao_social !== displayName ? `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-left: 1.5rem; margin-top: 1px;">${escapeHtml(item.razao_social)}</div>` : ''}
                </td>
                <td><span class="badge badge-blue">${escapeHtml(item.cidade)}</span></td>
                <td><code>${escapeHtml(item.documento || 'N/A')}</code></td>
                <td class="text-right" ${highlightQtdClass}>
                    ${item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                </td>
                <td class="text-right">
                    R$ ${formatMoney(item.preco_medio_item)}
                </td>
                <td class="text-right" ${highlightValClass}>
                    R$ ${formatMoney(item.valor_total)}
                </td>
                <td class="text-center">
                    <span class="badge">${item.qtd_compras}</span>
                </td>
                <td class="text-center no-print">
                    <div style="display: flex; gap: 4px; justify-content: center; align-items: center;">
                        <button type="button" class="btn-table-action" onclick="event.stopPropagation(); window.openClientFamilyItemsModal(${item.cod_pessoa}, '${cleanName}');" title="Ver famílias compradas por este cliente">
                            <span>📦</span> Ver Famílias
                        </button>
                        <button type="button" class="btn-table-action" onclick="event.stopPropagation(); window.printDirectClientReport(${item.cod_pessoa}, '${cleanName}');" title="Imprimir Relatório das Famílias deste Cliente" style="border-color: #059669; color: #34d399;">
                            <span>🖨️</span> Relatório
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updateFamiliaPrintMeta(data) {
    if (!familiaPrintDate) return;
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    familiaPrintDate.textContent = `Emissão: ${dateStr}`;

    if (familiaPrintFilter) {
        const famName = familiaSearchInput ? familiaSearchInput.value.trim() : 'Todos';
        const orderText = familiaOrderSelect ? familiaOrderSelect.options[familiaOrderSelect.selectedIndex].text : 'Valor';
        const tipoOpText = lblFamiliaTipoOpSelected ? lblFamiliaTipoOpSelected.textContent : 'Vendas';
        familiaPrintFilter.textContent = `Família: ${famName} | Ordenação: ${orderText} | Operação: ${tipoOpText}`;
    }
}

// ==========================================
// 📦 MODAL DE ITENS COMPRADOS PELO CLIENTE
// ==========================================

window.openClientFamilyItemsModal = async function(codPessoa, clientName) {
    if (!clientFamilyItemsModal) return;

    clientFamilyItemsModal.classList.remove('hidden');

    const rawFamilia = familiaSearchInput ? familiaSearchInput.value.trim() : '';
    const dtIni = familiaDateInicio ? familiaDateInicio.value : '';
    const dtFim = familiaDateFim ? familiaDateFim.value : '';

    if (modalItemsClientTitle) {
        modalItemsClientTitle.textContent = `📦 Famílias Compradas: ${clientName}`;
    }
    if (modalItemsClientSubtitle) {
        let periodStr = 'Todo o histórico';
        if (dtIni && dtFim) periodStr = `${formatDateBR(dtIni)} até ${formatDateBR(dtFim)}`;
        else if (dtIni) periodStr = `A partir de ${formatDateBR(dtIni)}`;
        else if (dtFim) periodStr = `Até ${formatDateBR(dtFim)}`;
        modalItemsClientSubtitle.textContent = `Cód. Cliente: ${codPessoa} | Filtro: "${rawFamilia || 'Todas'}" | Período: ${periodStr}`;
    }
    if (modalClientContactInfo) {
        modalClientContactInfo.textContent = 'Carregando dados do cliente...';
    }

    if (modalItemsFilterInput) {
        modalItemsFilterInput.value = '';
    }

    if (modalItemsTableBody) {
        modalItemsTableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center empty-state">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
                        <span>Carregando famílias compradas por este cliente...</span>
                    </div>
                </td>
            </tr>
        `;
    }

    const selectedTipos = getSelectedFamiliaTipos();
    let tipoOpParam = '';
    if (selectedTipos.length === 0) {
        tipoOpParam = FAMILIA_VENDA_TIPOS.join(',');
    } else if (selectedTipos.length === familiaTiposData.length) {
        tipoOpParam = 'todos';
    } else {
        tipoOpParam = selectedTipos.join(',');
    }

    let url = `/api/clientes/${codPessoa}/itens-comprados?limit=1500`;
    if (rawFamilia) {
        url += `&search=${encodeURIComponent(rawFamilia)}`;
    }
    if (tipoOpParam) {
        url += `&tipo_operacao=${encodeURIComponent(tipoOpParam)}`;
    }
    if (dtIni) {
        url += `&data_inicio=${encodeURIComponent(dtIni)}`;
    }
    if (dtFim) {
        url += `&data_fim=${encodeURIComponent(dtFim)}`;
    }

    try {
        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Erro ao carregar famílias compradas.');
        }

        const data = await res.json();
        currentClientPurchasedData = data;
        currentModalItemsList = data.items || [];

        if (modalClientContactInfo && data.cliente) {
            const c = data.cliente;
            let info = `📍 ${c.cidade}`;
            if (c.razao_social && c.razao_social !== (c.nome_fantasia || c.nome_cliente)) {
                info += ` | Razão Social: ${c.razao_social}`;
            }
            if (c.documento) info += ` | Doc: ${c.documento}`;
            if (c.telefone) info += ` | 📞 ${c.telefone}`;
            if (c.email) info += ` | ✉️ ${c.email}`;
            modalClientContactInfo.textContent = info;
        }

        if (modalStatFaturamento) modalStatFaturamento.textContent = `R$ ${formatMoney(data.total_faturamento)}`;
        if (modalStatQtd) modalStatQtd.textContent = `${(data.total_quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} un.`;
        if (modalStatItens) modalStatItens.textContent = data.total_familias || (data.items ? data.items.length : 0);
        if (modalStatTransacoes) modalStatTransacoes.textContent = data.total_transacoes || 0;
        if (modalStatPrecoMedio) modalStatPrecoMedio.textContent = `R$ ${formatMoney(data.ticket_medio_peca || 0)}`;

        renderModalItemsTable(currentModalItemsList);
    } catch (e) {
        showToast(e.message, 'error');
        if (modalItemsTableBody) {
            modalItemsTableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center empty-state" style="color: #ef4444;">
                        ${escapeHtml(e.message)}
                    </td>
                </tr>
            `;
        }
    }
};

function renderModalItemsTable(items) {
    if (!modalItemsTableBody) return;

    if (modalItemsCountBadge) {
        modalItemsCountBadge.textContent = `${items.length} famílias listadas`;
    }

    if (!items || items.length === 0) {
        modalItemsTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center empty-state">
                    Nenhuma família encontrada para os critérios informados.
                </td>
            </tr>
        `;
        return;
    }

    const codPessoa = currentClientPurchasedData && currentClientPurchasedData.cliente ? currentClientPurchasedData.cliente.cod_pessoa : 0;
    const clientName = currentClientPurchasedData && currentClientPurchasedData.cliente ? (currentClientPurchasedData.cliente.nome_fantasia || currentClientPurchasedData.cliente.nome_cliente || '') : '';
    const cleanClientName = escapeHtml(clientName).replace(/'/g, "\\'");

    modalItemsTableBody.innerHTML = items.map(item => {
        const cleanFamName = escapeHtml(item.nome_familia || 'Família').replace(/'/g, "\\'");

        return `
            <tr class="clickable-row" onclick="window.openFamilyOrdersModal(${item.cod_familia || 0}, '${cleanFamName}', ${codPessoa}, '${cleanClientName}');" title="Clique para ver todas as Ordens de Serviço (OS) em que esta família foi vendida">
                <td class="text-center"><code>${escapeHtml(item.cod_familia || '-')}</code></td>
                <td>
                    <span class="client-family-link">
                        <span>👓</span>
                        <strong>${escapeHtml(item.nome_familia || 'Sem Família')}</strong>
                    </span>
                </td>
                <td class="text-right" style="font-weight: 600; color: #34d399;">
                    ${(item.quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                </td>
                <td class="text-right">R$ ${formatMoney(item.preco_medio || 0)}</td>
                <td class="text-right" style="font-weight: 700; color: #60a5fa;">R$ ${formatMoney(item.valor_total || 0)}</td>
                <td class="text-center"><span class="badge badge-blue">${item.qtd_compras || 0}</span></td>
                <td class="text-center">${formatDateBR(item.primeira_compra)}</td>
                <td class="text-center">${formatDateBR(item.ultima_compra)}</td>
                <td class="text-center no-print">
                    <button type="button" class="btn-table-action" onclick="event.stopPropagation(); window.openFamilyOrdersModal(${item.cod_familia || 0}, '${cleanFamName}', ${codPessoa}, '${cleanClientName}');" title="Ver todas as Ordens de Serviço (OS) desta família">
                        <span>📋</span> Ver OSs
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Instant in-modal filter for Families
if (modalItemsFilterInput) {
    modalItemsFilterInput.addEventListener('input', (e) => {
        const q = e.target.value.trim().toUpperCase();
        if (!q) {
            renderModalItemsTable(currentModalItemsList);
            return;
        }

        const filtered = currentModalItemsList.filter(item => {
            const fam = (item.nome_familia || '').toUpperCase();
            const cod = String(item.cod_familia || '').toUpperCase();
            return fam.includes(q) || cod.includes(q);
        });

        renderModalItemsTable(filtered);
    });
}

// Close Families Modal Events
function closeItemsModal() {
    if (clientFamilyItemsModal) clientFamilyItemsModal.classList.add('hidden');
}

if (btnCloseItemsModal) btnCloseItemsModal.addEventListener('click', closeItemsModal);
if (btnCancelItemsModal) btnCancelItemsModal.addEventListener('click', closeItemsModal);

if (clientFamilyItemsModal) {
    clientFamilyItemsModal.addEventListener('click', (e) => {
        if (e.target === clientFamilyItemsModal) closeItemsModal();
    });
}

// ==========================================
// 📋 MODAL DE ORDENS DE SERVIÇO POR FAMÍLIA
// ==========================================

window.openFamilyOrdersModal = async function(codFamilia, nomeFamilia, codPessoa, clientName) {
    if (!familyOrdersModal) return;

    familyOrdersModal.classList.remove('hidden');

    const dtIni = familiaDateInicio ? familiaDateInicio.value : '';
    const dtFim = familiaDateFim ? familiaDateFim.value : '';

    if (modalFamilyOrdersTitle) {
        modalFamilyOrdersTitle.textContent = `📋 Ordens de Serviço: ${nomeFamilia}`;
    }
    if (modalFamilyOrdersSubtitle) {
        let periodStr = 'Todo o histórico';
        if (dtIni && dtFim) periodStr = `${formatDateBR(dtIni)} até ${formatDateBR(dtFim)}`;
        else if (dtIni) periodStr = `A partir de ${formatDateBR(dtIni)}`;
        else if (dtFim) periodStr = `Até ${formatDateBR(dtFim)}`;
        modalFamilyOrdersSubtitle.textContent = `Cliente: ${clientName} (Cód. ${codPessoa}) | Família: ${nomeFamilia} (ID: ${codFamilia || 'Geral'}) | Período: ${periodStr}`;
    }

    if (modalFamilyOrdersFilterInput) {
        modalFamilyOrdersFilterInput.value = '';
    }

    if (modalFamilyOrdersTableBody) {
        modalFamilyOrdersTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center empty-state">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
                        <span>🔍 Buscando Ordens de Serviço desta família no banco de dados...</span>
                        <span style="font-size: 0.8rem; color: var(--text-secondary);">Isso pode levar alguns instantes dependendo do volume histórico.</span>
                    </div>
                </td>
            </tr>
        `;
    }

    const selectedTipos = getSelectedFamiliaTipos();
    let tipoOpParam = '';
    if (selectedTipos.length === 0) {
        tipoOpParam = '1,11';
    } else if (selectedTipos.length === familiaTiposData.length) {
        tipoOpParam = 'todos';
    } else {
        tipoOpParam = selectedTipos.join(',');
    }

    let url = `/api/clientes/${codPessoa}/familias/${codFamilia}/ordens-servico?limit=1500`;
    if (nomeFamilia) {
        url += `&nome_familia=${encodeURIComponent(nomeFamilia)}`;
    }
    if (tipoOpParam) {
        url += `&tipo_operacao=${encodeURIComponent(tipoOpParam)}`;
    }
    if (dtIni) {
        url += `&data_inicio=${encodeURIComponent(dtIni)}`;
    }
    if (dtFim) {
        url += `&data_fim=${encodeURIComponent(dtFim)}`;
    }

    try {
        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Erro ao carregar Ordens de Serviço.');
        }

        const data = await res.json();
        currentFamilyOrdersData = data;
        currentFamilyOrdersList = data.items || [];

        if (modalFamilyOrdersStatCount) modalFamilyOrdersStatCount.textContent = `${data.total_ordens_servico || 0} OSs (${data.total_itens || 0} itens)`;
        if (modalFamilyOrdersStatFaturamento) modalFamilyOrdersStatFaturamento.textContent = `R$ ${formatMoney(data.total_faturamento || 0)}`;
        if (modalFamilyOrdersStatQtd) modalFamilyOrdersStatQtd.textContent = `${(data.total_quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} un.`;
        if (modalFamilyOrdersStatPrecoMedio) modalFamilyOrdersStatPrecoMedio.textContent = `R$ ${formatMoney(data.ticket_medio_peca || 0)}`;

        renderFamilyOrdersTable(currentFamilyOrdersList);
    } catch (e) {
        showToast(e.message, 'error');
        if (modalFamilyOrdersTableBody) {
            modalFamilyOrdersTableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center empty-state" style="color: #ef4444;">
                        ${escapeHtml(e.message)}
                    </td>
                </tr>
            `;
        }
    }
};

function renderFamilyOrdersTable(items) {
    if (!modalFamilyOrdersTableBody) return;

    if (modalFamilyOrdersCountBadge) {
        modalFamilyOrdersCountBadge.textContent = `${items.length} itens listados`;
    }

    if (!items || items.length === 0) {
        modalFamilyOrdersTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center empty-state">
                    Nenhuma Ordem de Serviço encontrada para os critérios informados.
                </td>
            </tr>
        `;
        return;
    }

    modalFamilyOrdersTableBody.innerHTML = items.map(item => `
        <tr class="clickable-row" onclick="openEditModal(${item.cod_transacao}, ${item.cod_empresa});" title="Clique para abrir e visualizar a OS #${item.numero_os}">
            <td><strong style="color: #60a5fa;">#${escapeHtml(item.numero_os)}</strong></td>
            <td class="text-center">${formatDateBR(item.data_emissao)}</td>
            <td><code>${escapeHtml(item.cod_item || '-')}</code></td>
            <td><strong>${escapeHtml(item.nome_item || '')}</strong></td>
            <td class="text-right" style="font-weight: 600; color: #34d399;">
                ${(item.quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
            </td>
            <td class="text-right">R$ ${formatMoney(item.valor_unitario || 0)}</td>
            <td class="text-right" style="font-weight: 700; color: #60a5fa;">R$ ${formatMoney(item.total || 0)}</td>
            <td>
                <span class="badge badge-secondary" title="${escapeHtml(item.natureza_descricao || '')}">
                    ${escapeHtml(item.cod_naturezaoperacao || 'N/A')}
                </span>
                <span style="font-size: 0.75rem; color: var(--text-secondary); margin-left: 4px;">${escapeHtml(item.natureza_descricao || '')}</span>
            </td>
            <td class="text-center no-print">
                <button type="button" class="btn-table-action" onclick="event.stopPropagation(); openEditModal(${item.cod_transacao}, ${item.cod_empresa});" title="Abrir e editar a OS #${item.numero_os}">
                    <span>📝</span> Abrir OS
                </button>
            </td>
        </tr>
    `).join('');
}

// Instant filter inside Family Orders Modal
if (modalFamilyOrdersFilterInput) {
    modalFamilyOrdersFilterInput.addEventListener('input', (e) => {
        const q = e.target.value.trim().toUpperCase();
        if (!q) {
            renderFamilyOrdersTable(currentFamilyOrdersList);
            return;
        }

        const filtered = currentFamilyOrdersList.filter(item => {
            const os = String(item.numero_os || '').toUpperCase();
            const cod = String(item.cod_item || '').toUpperCase();
            const desc = (item.nome_item || '').toUpperCase();
            const nat = (item.natureza_descricao || '').toUpperCase();
            const cfop = (item.cod_naturezaoperacao || '').toUpperCase();
            return os.includes(q) || cod.includes(q) || desc.includes(q) || nat.includes(q) || cfop.includes(q);
        });

        renderFamilyOrdersTable(filtered);
    });
}

// Close Family Orders Modal Events
function closeFamilyOrdersModal() {
    if (familyOrdersModal) familyOrdersModal.classList.add('hidden');
}

if (btnCloseFamilyOrdersModal) btnCloseFamilyOrdersModal.addEventListener('click', closeFamilyOrdersModal);
if (btnCancelFamilyOrdersModal) btnCancelFamilyOrdersModal.addEventListener('click', closeFamilyOrdersModal);

if (familyOrdersModal) {
    familyOrdersModal.addEventListener('click', (e) => {
        if (e.target === familyOrdersModal) closeFamilyOrdersModal();
    });
}

// Global Escape Key Listener with Hierarchy
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (familyOrdersModal && !familyOrdersModal.classList.contains('hidden')) {
            closeFamilyOrdersModal();
            e.stopPropagation();
            return;
        }
        if (clientFamilyItemsModal && !clientFamilyItemsModal.classList.contains('hidden')) {
            closeItemsModal();
            e.stopPropagation();
            return;
        }
    }
});

// Print Family Orders Report
function printFamilyOrdersReport() {
    if (!currentFamilyOrdersData || !currentFamilyOrdersList) {
        showToast('Nenhum dado de OS carregado para impressão.', 'warning');
        return;
    }

    const data = currentFamilyOrdersData;
    const c = data.cliente || {};
    const items = currentFamilyOrdersList;
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const dtIni = familiaDateInicio ? familiaDateInicio.value : '';
    const dtFim = familiaDateFim ? familiaDateFim.value : '';
    let periodStr = 'Todo o histórico';
    if (dtIni && dtFim) periodStr = `${formatDateBR(dtIni)} até ${formatDateBR(dtFim)}`;
    else if (dtIni) periodStr = `A partir de ${formatDateBR(dtIni)}`;
    else if (dtFim) periodStr = `Até ${formatDateBR(dtFim)}`;

    const html = `
        <div class="client-print-report">
            <div class="client-print-header">
                <div class="client-print-title">RELATÓRIO DE ORDENS DE SERVIÇO POR FAMÍLIA DE PRODUTOS</div>
                <div class="client-print-meta-row" style="margin-top: 6px; font-size: 8.5pt; color: #374151;">
                    <div>
                        <strong>Cliente:</strong> ${escapeHtml(c.nome_fantasia || c.nome_cliente)} (Cód. ${c.cod_pessoa})
                        ${c.razao_social && c.razao_social !== (c.nome_fantasia || c.nome_cliente) ? ` | <strong>Razão Social:</strong> ${escapeHtml(c.razao_social)}` : ''}
                        | <strong>Cidade:</strong> ${escapeHtml(c.cidade)}
                        ${c.documento ? ` | <strong>Doc:</strong> ${escapeHtml(c.documento)}` : ''}
                    </div>
                    <div style="margin-top: 3px;">
                        <strong>Família de Lentes:</strong> ${escapeHtml(data.nome_familia)} (ID: ${data.cod_familia || 'Geral'}) | <strong>Período:</strong> ${periodStr} | <strong>Emissão:</strong> ${dateStr}
                    </div>
                </div>
            </div>

            <div class="client-print-stats" style="margin: 10px 0;">
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Total de OSs</span>
                    <span class="client-print-stat-value" style="color: #2563eb;">${data.total_ordens_servico || 0}</span>
                </div>
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Volume de Peças</span>
                    <span class="client-print-stat-value">${(data.total_quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} un.</span>
                </div>
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Faturamento Total</span>
                    <span class="client-print-stat-value" style="color: #059669;">R$ ${formatMoney(data.total_faturamento || 0)}</span>
                </div>
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Preço Médio / Peça</span>
                    <span class="client-print-stat-value">R$ ${formatMoney(data.ticket_medio_peca || 0)}</span>
                </div>
            </div>

            <table class="client-print-table">
                <thead>
                    <tr>
                        <th style="width: 70px;">Nº OS</th>
                        <th style="width: 75px;" class="text-center">Data</th>
                        <th style="width: 70px;">Cód. Item</th>
                        <th>Descrição da Lente / Item</th>
                        <th class="text-right" style="width: 60px;">Qtd</th>
                        <th class="text-right" style="width: 80px;">Valor Unit.</th>
                        <th class="text-right" style="width: 90px;">Total (R$)</th>
                        <th style="width: 140px;">CFOP / Operação</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(item => `
                        <tr>
                            <td><strong>#${escapeHtml(item.numero_os)}</strong></td>
                            <td class="text-center">${formatDateBR(item.data_emissao)}</td>
                            <td><code>${escapeHtml(item.cod_item || '')}</code></td>
                            <td>${escapeHtml(item.nome_item || '')}</td>
                            <td class="text-right">${(item.quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                            <td class="text-right">R$ ${formatMoney(item.valor_unitario || 0)}</td>
                            <td class="text-right" style="font-weight: bold;">R$ ${formatMoney(item.total || 0)}</td>
                            <td>${escapeHtml(item.cod_naturezaoperacao || '')} - ${escapeHtml(item.natureza_descricao || '')}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr class="totals-row">
                        <td colspan="4" style="text-align: right; font-weight: bold;">TOTAIS GERAIS:</td>
                        <td style="text-align: right; font-weight: bold;">${(data.total_quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                        <td style="text-align: right;">-</td>
                        <td style="text-align: right; font-weight: bold; color: #2563eb;">R$ ${formatMoney(data.total_faturamento || 0)}</td>
                        <td style="font-weight: bold;">${data.total_ordens_servico || 0} OSs distintas</td>
                    </tr>
                </tfoot>
            </table>

            <div class="client-print-footer">
                Relatório gerado por Aspheric Analytics • Base de Dados: Firebird (${document.title || 'Dilab'})
            </div>
        </div>
    `;

    if (printFamilyOrdersContainer) {
        printFamilyOrdersContainer.innerHTML = html;
    }

    document.body.classList.add('printing-family-orders');

    const cleanup = () => {
        document.body.classList.remove('printing-family-orders');
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    setTimeout(() => {
        window.print();
        setTimeout(cleanup, 2500);
    }, 150);
}

if (btnPrintFamilyOrders) {
    btnPrintFamilyOrders.addEventListener('click', printFamilyOrdersReport);
}

// ============================================================
// 🖨️ RELATÓRIO PROFISSIONAL: CLIENTES QUE COMPRARAM
// ============================================================
function printClientesFamiliaReport() {
    if (!clientesFamiliaList || clientesFamiliaList.length === 0) {
        showToast('Nenhum cliente listado na pesquisa atual para emitir o relatório.', 'warning');
        return;
    }

    const data = currentClientesFamiliaData || {};
    const items = clientesFamiliaList;
    const now = new Date();
    const emissaoStr = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const rawSearch = familiaSearchInput ? familiaSearchInput.value.trim() : '';
    const dtIni = familiaDateInicio ? familiaDateInicio.value : '';
    const dtFim = familiaDateFim ? familiaDateFim.value : '';
    const orderText = familiaOrderSelect ? familiaOrderSelect.options[familiaOrderSelect.selectedIndex].text : 'Maior Valor Comprado';
    const tipoOpText = lblFamiliaTipoOpSelected ? lblFamiliaTipoOpSelected.textContent : 'Vendas';

    let periodText = 'Histórico Completo';
    if (dtIni && dtFim) periodText = `${formatDateBR(dtIni)} até ${formatDateBR(dtFim)}`;
    else if (dtIni) periodText = `A partir de ${formatDateBR(dtIni)}`;
    else if (dtFim) periodText = `Até ${formatDateBR(dtFim)}`;

    const totalFat = data.total_faturamento || items.reduce((acc, it) => acc + (it.valor_total || 0), 0);
    const totalQtd = data.total_quantidade || items.reduce((acc, it) => acc + (it.quantidade || 0), 0);
    const totalCompras = data.total_compras || items.reduce((acc, it) => acc + (it.qtd_compras || 0), 0);
    const ticketMedio = items.length > 0 ? (totalFat / items.length) : 0;
    const precoMedioGlobal = totalQtd > 0 ? (totalFat / totalQtd) : 0;

    let tableRowsHtml = items.map((it, idx) => {
        const rank = it.ranking || (idx + 1);
        const partFat = totalFat > 0 ? ((it.valor_total / totalFat) * 100).toFixed(1) : '0.0';
        const nomeFantasia = it.nome_fantasia || it.nome_cliente || `Cliente ${it.cod_pessoa}`;
        const razaoSocial = it.razao_social || '';
        const hasDiffRazao = razaoSocial && razaoSocial !== nomeFantasia;

        return `
            <tr>
                <td style="text-align: center; font-weight: bold;">${rank}º</td>
                <td style="text-align: center;"><code>${escapeHtml(it.cod_pessoa)}</code></td>
                <td>
                    <div style="font-weight: bold; color: #1e3a8a;">${escapeHtml(nomeFantasia)}</div>
                    ${hasDiffRazao ? `<div style="font-size: 7.5pt; color: #64748b;">${escapeHtml(razaoSocial)}</div>` : ''}
                </td>
                <td>${escapeHtml(it.cidade || 'NÃO INFORMADA')}</td>
                <td style="font-size: 7.5pt;">${escapeHtml(it.documento || 'ISENTO')}</td>
                <td style="text-align: right; font-weight: 600;">${(it.quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                <td style="text-align: right;">R$ ${formatMoney(it.preco_medio_item || 0)}</td>
                <td style="text-align: right; font-weight: bold; color: #1e3a8a;">R$ ${formatMoney(it.valor_total || 0)}</td>
                <td style="text-align: center;">${it.qtd_compras || 0}</td>
                <td style="text-align: right; font-size: 7.5pt; color: #059669; font-weight: bold;">${partFat}%</td>
            </tr>
        `;
    }).join('');

    const html = `
        <div class="client-print-report">
            <div class="client-print-header">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <h1 class="client-print-title">RELATÓRIO DE CLIENTES QUE COMPRARAM POR PRODUTO / FAMÍLIA</h1>
                        <div style="font-size: 10pt; font-weight: bold; color: #1e3a8a; margin-top: 2px;">
                            Termo de Pesquisa: "${escapeHtml(rawSearch || 'Todas as Famílias')}"
                        </div>
                    </div>
                    <div style="text-align: right; font-size: 8.5pt; color: #4b5563;">
                        <div>Emissão: <strong>${emissaoStr}</strong></div>
                        <div>Total Clientes: <strong>${items.length}</strong></div>
                    </div>
                </div>

                <div class="client-print-card" style="margin-top: 8px;">
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; font-size: 8.5pt;">
                        <div><strong>Período:</strong> ${periodText}</div>
                        <div><strong>Operações:</strong> ${escapeHtml(tipoOpText)}</div>
                        <div><strong>Ordenação:</strong> ${escapeHtml(orderText)}</div>
                        <div><strong>Base:</strong> Firebird (${document.title || 'Dilab'})</div>
                    </div>
                </div>
            </div>

            <!-- Stats KPI Cards -->
            <div class="client-print-stats" style="grid-template-columns: repeat(5, 1fr); margin: 10px 0;">
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Faturamento Total</span>
                    <span class="client-print-stat-value" style="color: #059669;">R$ ${formatMoney(totalFat)}</span>
                </div>
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Volume de Peças</span>
                    <span class="client-print-stat-value" style="color: #2563eb;">${(totalQtd).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} un.</span>
                </div>
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Clientes Distintos</span>
                    <span class="client-print-stat-value">${items.length}</span>
                </div>
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Total Compras / Transações</span>
                    <span class="client-print-stat-value">${totalCompras}</span>
                </div>
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Ticket Médio / Cliente</span>
                    <span class="client-print-stat-value">R$ ${formatMoney(ticketMedio)}</span>
                </div>
            </div>

            <!-- Clientes Table -->
            <table class="client-print-table">
                <thead>
                    <tr>
                        <th style="width: 38px; text-align: center;">Rank</th>
                        <th style="width: 50px; text-align: center;">Cód.</th>
                        <th>Nome Fantasia / Razão Social</th>
                        <th style="width: 125px;">Cidade</th>
                        <th style="width: 105px;">CNPJ / CPF</th>
                        <th style="width: 75px; text-align: right;">Qtd Comprada</th>
                        <th style="width: 75px; text-align: right;">Preço Médio</th>
                        <th style="width: 95px; text-align: right;">Total Comprado</th>
                        <th style="width: 60px; text-align: center;">Nº Compras</th>
                        <th style="width: 55px; text-align: right;">% Part.</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHtml}
                </tbody>
                <tfoot>
                    <tr class="totals-row">
                        <td colspan="5" style="text-align: right; font-weight: bold;">TOTAIS CONSOLIDADOS:</td>
                        <td style="text-align: right; font-weight: bold; color: #059669;">
                            ${(totalQtd).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                        </td>
                        <td style="text-align: right; font-weight: bold;">
                            R$ ${formatMoney(precoMedioGlobal)}
                        </td>
                        <td style="text-align: right; font-weight: bold; color: #1e3a8a;">
                            R$ ${formatMoney(totalFat)}
                        </td>
                        <td style="text-align: center; font-weight: bold;">${totalCompras}</td>
                        <td style="text-align: right; font-weight: bold; color: #059669;">100.0%</td>
                    </tr>
                </tfoot>
            </table>

            <div class="client-print-footer" style="margin-top: 12px; font-size: 8pt; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 6px; display: flex; justify-content: space-between;">
                <span>Aspheric Analytics • Relatório Gerencial de Clientes por Família</span>
                <span>${items.length} clientes listados</span>
            </div>
        </div>
    `;

    // Isolamento absoluto: esvaziar os outros containers de impressão
    if (printClientItemsContainer) printClientItemsContainer.innerHTML = '';
    if (printFamilyOrdersContainer) printFamilyOrdersContainer.innerHTML = '';

    if (printClientesFamiliaContainer) {
        printClientesFamiliaContainer.innerHTML = html;
    }

    document.body.classList.remove('printing-client-items', 'printing-family-orders');
    document.body.classList.add('printing-clientes-familia');

    const cleanup = () => {
        document.body.classList.remove('printing-clientes-familia');
        if (printClientesFamiliaContainer) printClientesFamiliaContainer.innerHTML = '';
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    setTimeout(() => {
        window.print();
        setTimeout(cleanup, 2500);
    }, 150);
}

if (btnPrintClientesFamilia) {
    btnPrintClientesFamilia.addEventListener('click', printClientesFamiliaReport);
}

// =========================================================================
// 🖨️ IMPRESSÃO DO RELATÓRIO DE FAMÍLIAS DO CLIENTE (EXCLUSIVO PARA O CLIENTE)
// =========================================================================
function printClientPurchasedItemsReport() {
    if (!printClientItemsContainer) {
        window.print();
        return;
    }

    // Isolamento absoluto: esvaziar os outros containers para JAMAIS misturar outros clientes
    if (printClientesFamiliaContainer) printClientesFamiliaContainer.innerHTML = '';
    if (printFamilyOrdersContainer) printFamilyOrdersContainer.innerHTML = '';

    const data = currentClientPurchasedData || {};
    const client = data.cliente || {};
    const items = currentModalItemsList || [];
    const searchDescription = (familiaSearchInput && familiaSearchInput.value.trim()) || data.termo_pesquisado || 'Todas as Famílias';
    const dtIni = familiaDateInicio ? familiaDateInicio.value : '';
    const dtFim = familiaDateFim ? familiaDateFim.value : '';
    let periodText = 'Histórico Completo';
    if (dtIni && dtFim) periodText = `${formatDateBR(dtIni)} até ${formatDateBR(dtFim)}`;
    else if (dtIni) periodText = `A partir de ${formatDateBR(dtIni)}`;
    else if (dtFim) periodText = `Até ${formatDateBR(dtFim)}`;

    const displayName = client.nome_fantasia || client.nome_cliente || `Cliente ${client.cod_pessoa || ''}`;
    const razaoSocial = client.razao_social || '';

    const now = new Date();
    const emissaoStr = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const totalFat = data.total_faturamento || 0;

    let tableRowsHtml = items.map((it, idx) => {
        const part = totalFat > 0 ? (((it.valor_total || 0) / totalFat) * 100).toFixed(1) + '%' : '0.0%';
        return `
            <tr>
                <td style="text-align: center; color: #64748b;">${idx + 1}</td>
                <td style="text-align: center;"><code>${escapeHtml(it.cod_familia || '-')}</code></td>
                <td><strong>${escapeHtml(it.nome_familia || 'Sem Família')}</strong></td>
                <td style="text-align: right; font-weight: 600; color: #2563eb;">${(it.quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                <td style="text-align: right; color: #059669; font-weight: 600;">${part}</td>
                <td style="text-align: right;">R$ ${formatMoney(it.preco_medio || 0)}</td>
                <td style="text-align: right; font-weight: 700; color: #1e3a8a;">R$ ${formatMoney(it.valor_total || 0)}</td>
                <td style="text-align: center;">${it.qtd_compras || 0}</td>
                <td style="text-align: center;">${formatDateBR(it.primeira_compra)}</td>
                <td style="text-align: center;">${formatDateBR(it.ultima_compra)}</td>
            </tr>
        `;
    }).join('');

    printClientItemsContainer.innerHTML = `
        <div class="client-print-report">
            <div class="client-print-header">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <div style="font-size: 8pt; font-weight: 700; color: #2563eb; text-transform: uppercase; letter-spacing: 0.5px;">Aspheric Analytics • Relatório de Compras por Cliente</div>
                        <h1 class="client-print-title" style="margin-top: 2px;">Famílias Compradas pelo Cliente</h1>
                        <div style="font-size: 11pt; font-weight: bold; color: #1e3a8a; margin-top: 2px;">
                            ${escapeHtml(displayName)} <span style="font-size: 9pt; font-weight: normal; color: #475569;">(Cód. ${escapeHtml(client.cod_pessoa || '')})</span>
                        </div>
                        ${razaoSocial && razaoSocial !== displayName ? `<div style="font-size: 8.5pt; color: #475569; font-style: italic;">Razão Social: ${escapeHtml(razaoSocial)}</div>` : ''}
                    </div>
                    <div style="text-align: right; font-size: 8.5pt; color: #4b5563;">
                        <div>Emissão: <strong>${emissaoStr}</strong></div>
                        <div>Total Famílias: <strong>${items.length}</strong></div>
                    </div>
                </div>
                <div class="client-print-card" style="margin-top: 8px;">
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; font-size: 8.5pt;">
                        <div><strong>Cidade / UF:</strong> ${escapeHtml(client.cidade || 'Não informada')}</div>
                        <div><strong>CNPJ / CPF:</strong> ${escapeHtml(client.documento || 'Não informado')}</div>
                        <div><strong>Telefone:</strong> ${escapeHtml(client.telefone || 'Não informado')}</div>
                        <div><strong>Filtro de Família:</strong> "${escapeHtml(searchDescription)}"</div>
                        <div><strong>Período:</strong> ${periodText}</div>
                        <div><strong>E-mail:</strong> ${escapeHtml(client.email || 'Não informado')}</div>
                    </div>
                </div>
            </div>

            <!-- Stats KPI Cards -->
            <div class="client-print-stats">
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Total Faturado</span>
                    <span class="client-print-stat-value" style="color: #059669;">R$ ${formatMoney(data.total_faturamento || 0)}</span>
                </div>
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Volume de Peças</span>
                    <span class="client-print-stat-value" style="color: #2563eb;">${(data.total_quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} un.</span>
                </div>
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Famílias Distintas</span>
                    <span class="client-print-stat-value">${data.total_familias || items.length}</span>
                </div>
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Transações / Compras</span>
                    <span class="client-print-stat-value">${data.total_transacoes || 0}</span>
                </div>
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Preço Médio / Peça</span>
                    <span class="client-print-stat-value">R$ ${formatMoney(data.ticket_medio_peca || 0)}</span>
                </div>
            </div>

            <!-- Items Table -->
            <table class="client-print-table">
                <thead>
                    <tr>
                        <th style="width: 35px; text-align: center;">#</th>
                        <th style="width: 65px; text-align: center;">Cód.</th>
                        <th>Descrição da Família de Produtos</th>
                        <th style="width: 75px; text-align: right;">Qtd</th>
                        <th style="width: 60px; text-align: right;">% Part.</th>
                        <th style="width: 85px; text-align: right;">Preço Médio</th>
                        <th style="width: 105px; text-align: right;">Total Comprado (R$)</th>
                        <th style="width: 65px; text-align: center;">Compras</th>
                        <th style="width: 80px; text-align: center;">1ª Compra</th>
                        <th style="width: 80px; text-align: center;">Última Compra</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHtml || '<tr><td colspan="10" style="text-align:center; padding: 15px;">Nenhuma família encontrada para este cliente no período selecionado.</td></tr>'}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="3" style="text-align: right; font-weight: bold;">TOTAIS CONSOLIDADOS DO CLIENTE:</td>
                        <td style="text-align: right; font-weight: bold; color: #2563eb;">
                            ${(data.total_quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                        </td>
                        <td style="text-align: right; font-weight: bold; color: #059669;">100.0%</td>
                        <td style="text-align: right; font-weight: bold;">
                            R$ ${formatMoney(data.ticket_medio_peca || 0)}
                        </td>
                        <td style="text-align: right; font-weight: bold; color: #059669;">
                            R$ ${formatMoney(data.total_faturamento || 0)}
                        </td>
                        <td style="text-align: center; font-weight: bold;">${data.total_transacoes || 0}</td>
                        <td colspan="2"></td>
                    </tr>
                </tfoot>
            </table>

            <div class="client-print-footer" style="margin-top: 12px; font-size: 8pt; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 6px; display: flex; justify-content: space-between;">
                <span>Aspheric Analytics • Relatório emitido especificamente para o cliente ${escapeHtml(displayName)}</span>
                <span>${items.length} famílias adquiridas</span>
            </div>
        </div>
    `;

    document.body.classList.remove('printing-clientes-familia', 'printing-family-orders');
    document.body.classList.add('printing-client-items');

    const cleanup = () => {
        document.body.classList.remove('printing-client-items');
        if (printClientItemsContainer) printClientItemsContainer.innerHTML = '';
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    setTimeout(() => {
        window.print();
        setTimeout(cleanup, 2500);
    }, 150);
}

if (btnPrintModalItems) {
    btnPrintModalItems.addEventListener('click', printClientPurchasedItemsReport);
}

// Impressão direta do relatório de famílias a partir do botão na linha da tabela
window.printDirectClientReport = async function(codPessoa, clientName) {
    if (currentClientPurchasedData && currentClientPurchasedData.cliente && currentClientPurchasedData.cliente.cod_pessoa === codPessoa) {
        printClientPurchasedItemsReport();
        return;
    }

    showToast(`Carregando relatório de ${clientName}...`, 'info');
    const rawFamilia = familiaSearchInput ? familiaSearchInput.value.trim() : '';
    const dtIni = familiaDateInicio ? familiaDateInicio.value : '';
    const dtFim = familiaDateFim ? familiaDateFim.value : '';

    const selectedTipos = getSelectedFamiliaTipos();
    let tipoOpParam = '';
    if (selectedTipos.length === 0) {
        tipoOpParam = '1,11';
    } else if (selectedTipos.length === familiaTiposData.length) {
        tipoOpParam = 'todos';
    } else {
        tipoOpParam = selectedTipos.join(',');
    }

    let url = `/api/clientes/${codPessoa}/itens-comprados?limit=1500`;
    if (rawFamilia) url += `&search=${encodeURIComponent(rawFamilia)}`;
    if (tipoOpParam) url += `&tipo_operacao=${encodeURIComponent(tipoOpParam)}`;
    if (dtIni) url += `&data_inicio=${encodeURIComponent(dtIni)}`;
    if (dtFim) url += `&data_fim=${encodeURIComponent(dtFim)}`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Erro ao carregar dados do cliente.');
        const data = await res.json();
        currentClientPurchasedData = data;
        currentModalItemsList = data.items || [];
        printClientPurchasedItemsReport();
    } catch (err) {
        showToast(err.message, 'error');
    }
};

// =========================================================================
// 🖨️ IMPRESSÃO DO RELATÓRIO DE ORDENS DE SERVIÇO DA FAMÍLIA PARA O CLIENTE
// =========================================================================
function printFamilyOrdersReport() {
    if (!printFamilyOrdersContainer) {
        window.print();
        return;
    }

    // Isolamento absoluto: esvaziar os outros containers de impressão
    if (printClientesFamiliaContainer) printClientesFamiliaContainer.innerHTML = '';
    if (printClientItemsContainer) printClientItemsContainer.innerHTML = '';

    const data = currentFamilyOrdersData || {};
    const client = (currentClientPurchasedData && currentClientPurchasedData.cliente) || data.cliente || {};
    const items = currentFamilyOrdersList || [];
    const codFamilia = (items.length > 0 && items[0].cod_familia) || 0;
    const nomeFamilia = (data.nome_familia) || (items.length > 0 && items[0].nome_familia) || 'Família de Produtos';
    const dtIni = familiaDateInicio ? familiaDateInicio.value : '';
    const dtFim = familiaDateFim ? familiaDateFim.value : '';
    let periodText = 'Histórico Completo';
    if (dtIni && dtFim) periodText = `${formatDateBR(dtIni)} até ${formatDateBR(dtFim)}`;
    else if (dtIni) periodText = `A partir de ${formatDateBR(dtIni)}`;
    else if (dtFim) periodText = `Até ${formatDateBR(dtFim)}`;

    const displayName = client.nome_fantasia || client.nome_cliente || `Cliente ${client.cod_pessoa || ''}`;
    const razaoSocial = client.razao_social || '';

    const now = new Date();
    const emissaoStr = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let tableRowsHtml = items.map((it) => `
        <tr>
            <td style="text-align: center;">${formatDateBR(it.data_emissao)}</td>
            <td style="text-align: center; font-weight: bold;">
                <span class="badge" style="border: 1px solid #1e3a8a; color: #1e3a8a; font-weight: bold;">${escapeHtml(it.numero_os || it.cod_transacao || '-')}</span>
            </td>
            <td style="text-align: center;"><code>${escapeHtml(it.cod_item || '-')}</code></td>
            <td><strong>${escapeHtml(it.nome_item || '-')}</strong></td>
            <td style="text-align: right; font-weight: 600; color: #2563eb;">${(it.quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
            <td style="text-align: right;">R$ ${formatMoney(it.valor_unitario || 0)}</td>
            <td style="text-align: right; color: ${it.valor_desconto > 0 ? '#b91c1c' : '#64748b'};">
                ${it.valor_desconto > 0 ? `R$ ${formatMoney(it.valor_desconto)}` : '-'}
            </td>
            <td style="text-align: right; font-weight: 700; color: #047857;">R$ ${formatMoney(it.total || 0)}</td>
            <td style="font-size: 7.5pt; color: #334155;">${escapeHtml(it.natureza_descricao || ('CFOP ' + (it.cod_natureza_operacao || '')))}</td>
        </tr>
    `).join('');

    printFamilyOrdersContainer.innerHTML = `
        <div class="client-print-report">
            <div class="client-print-header">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <div style="font-size: 8pt; font-weight: 700; color: #2563eb; text-transform: uppercase; letter-spacing: 0.5px;">Aspheric Analytics • Relatório de Ordens de Serviço</div>
                        <h1 class="client-print-title" style="margin-top: 2px;">Ordens de Serviço por Família / Produto</h1>
                        <div style="font-size: 11pt; font-weight: bold; color: #1e3a8a; margin-top: 2px;">
                            Cliente: ${escapeHtml(displayName)} <span style="font-size: 9pt; font-weight: normal; color: #475569;">(Cód. ${escapeHtml(client.cod_pessoa || '')})</span>
                        </div>
                        ${razaoSocial && razaoSocial !== displayName ? `<div style="font-size: 8.5pt; color: #475569; font-style: italic;">Razão Social: ${escapeHtml(razaoSocial)}</div>` : ''}
                    </div>
                    <div style="text-align: right; font-size: 8.5pt; color: #4b5563;">
                        <div>Emissão: <strong>${emissaoStr}</strong></div>
                        <div>Total Itens/OS: <strong>${items.length}</strong></div>
                    </div>
                </div>
                <div class="client-print-card" style="margin-top: 8px;">
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; font-size: 8.5pt;">
                        <div><strong>Família Selecionada:</strong> ${escapeHtml(nomeFamilia)} ${codFamilia ? `(ID ${codFamilia})` : ''}</div>
                        <div><strong>Período Pesquisado:</strong> ${periodText}</div>
                        <div><strong>Cidade / UF:</strong> ${escapeHtml(client.cidade || 'Não informada')}</div>
                        <div><strong>CNPJ / CPF:</strong> ${escapeHtml(client.documento || 'Não informado')}</div>
                        <div><strong>Total OSs Distintas:</strong> ${data.total_ordens_servico || 0} OSs</div>
                        <div><strong>Total Faturado Família:</strong> R$ ${formatMoney(data.total_faturamento || 0)}</div>
                    </div>
                </div>
            </div>

            <!-- Stats KPI Cards -->
            <div class="client-print-stats" style="grid-template-columns: repeat(4, 1fr);">
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Total Faturado</span>
                    <span class="client-print-stat-value" style="color: #059669;">R$ ${formatMoney(data.total_faturamento || 0)}</span>
                </div>
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Volume de Peças</span>
                    <span class="client-print-stat-value" style="color: #2563eb;">${(data.total_quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} un.</span>
                </div>
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Ordens de Serviço</span>
                    <span class="client-print-stat-value">${data.total_ordens_servico || 0} OSs</span>
                </div>
                <div class="client-print-stat-box">
                    <span class="client-print-stat-label">Preço Médio / Peça</span>
                    <span class="client-print-stat-value">R$ ${formatMoney(data.ticket_medio_peca || 0)}</span>
                </div>
            </div>

            <!-- OS Table -->
            <table class="client-print-table">
                <thead>
                    <tr>
                        <th style="width: 75px; text-align: center;">Data</th>
                        <th style="width: 85px; text-align: center;">Nº da OS</th>
                        <th style="width: 70px; text-align: center;">Cód. Item</th>
                        <th>Descrição da Lente / Produto</th>
                        <th style="width: 55px; text-align: right;">Qtd</th>
                        <th style="width: 85px; text-align: right;">Vlr Unit (R$)</th>
                        <th style="width: 75px; text-align: right;">Desconto</th>
                        <th style="width: 95px; text-align: right;">Total Item (R$)</th>
                        <th style="width: 140px;">CFOP / Operação</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHtml || '<tr><td colspan="9" style="text-align:center; padding: 15px;">Nenhuma OS encontrada para esta família e cliente no período selecionado.</td></tr>'}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="4" style="text-align: right; font-weight: bold;">TOTAIS GERAIS:</td>
                        <td style="text-align: right; font-weight: bold; color: #2563eb;">
                            ${(data.total_quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                        </td>
                        <td></td>
                        <td></td>
                        <td style="text-align: right; font-weight: bold; color: #059669;">
                            R$ ${formatMoney(data.total_faturamento || 0)}
                        </td>
                        <td style="font-weight: bold;">${data.total_ordens_servico || 0} OSs</td>
                    </tr>
                </tfoot>
            </table>

            <div class="client-print-footer" style="margin-top: 12px; font-size: 8pt; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 6px; display: flex; justify-content: space-between;">
                <span>Aspheric Analytics • Relatório de OSs da família ${escapeHtml(nomeFamilia)} para ${escapeHtml(displayName)}</span>
                <span>${items.length} itens listados</span>
            </div>
        </div>
    `;

    document.body.classList.remove('printing-clientes-familia', 'printing-client-items');
    document.body.classList.add('printing-family-orders');

    const cleanup = () => {
        document.body.classList.remove('printing-family-orders');
        if (printFamilyOrdersContainer) printFamilyOrdersContainer.innerHTML = '';
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    setTimeout(() => {
        window.print();
        setTimeout(cleanup, 2500);
    }, 150);
}

if (btnPrintFamilyOrders) {
    btnPrintFamilyOrders.addEventListener('click', printFamilyOrdersReport);
}

if (btnSearchClientesFamilia) {
    btnSearchClientesFamilia.addEventListener('click', loadClientesFamiliaReport);
}

// ============================================================
// 🖨️ RELATÓRIO PROFISSIONAL DE ORDENS DE SERVIÇO & GARANTIAS
// ============================================================
function printOSReport(reportData) {
    if (!printOsReportContainer) return;

    // Isolamento absoluto: esvaziar todos os outros containers de impressão
    if (printClientesFamiliaContainer) printClientesFamiliaContainer.innerHTML = '';
    if (printClientItemsContainer) printClientItemsContainer.innerHTML = '';
    if (printFamilyOrdersContainer) printFamilyOrdersContainer.innerHTML = '';

    const periodo = reportData.periodo || {};
    const filtros = reportData.filtros || {};
    const resumo = reportData.resumo || {};
    const familiasGarantia = reportData.familias_garantia || [];

    // O relatório só deve apresentar as operações fiscais: 5.949-4, 5.949-3 e 6.949-4
    const OP_GARANTIA_SET = new Set(['5.949-4', '5.949-3', '6.949-4', '5949-4', '5949-3', '6949-4', '6949-3']);
    const isOpGarantia = (cfop) => {
        if (!cfop) return false;
        const clean = String(cfop).trim();
        return OP_GARANTIA_SET.has(clean) || OP_GARANTIA_SET.has(clean.replace(/\./g, ''));
    };

    const ordensServico = (reportData.ordens_servico || []).filter(o => isOpGarantia(o.cod_naturezaoperacao));

    const totalOSCalc = ordensServico.length;
    const totalFatCalc = ordensServico.reduce((acc, o) => acc + (o.total || 0), 0);
    const totalICMSCalc = ordensServico.reduce((acc, o) => acc + (o.total_icms || 0), 0);
    const totalGarPecasCalc = resumo.total_garantia_pecas || 0;
    const totalGarValCalc = resumo.total_garantia_valor > 0 ? resumo.total_garantia_valor : totalFatCalc;

    const now = new Date();
    const emissaoStr = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let periodText = 'Histórico Geral Completo';
    if (periodo.data_inicio && periodo.data_fim) periodText = `${formatDateBR(periodo.data_inicio)} até ${formatDateBR(periodo.data_fim)}`;
    else if (periodo.data_inicio) periodText = `A partir de ${formatDateBR(periodo.data_inicio)}`;
    else if (periodo.data_fim) periodText = `Até ${formatDateBR(periodo.data_fim)}`;

    // Tabela consolidada das Famílias de Lentes em Garantia
    let familiasGarantiaRowsHtml = '';
    if (familiasGarantia.length > 0) {
        familiasGarantiaRowsHtml = familiasGarantia.map((fg, idx) => {
            const partPecas = totalGarPecasCalc > 0 ? ((fg.qtd_pecas / totalGarPecasCalc) * 100).toFixed(1) : '0.0';
            return `
                <tr>
                    <td style="text-align: center; font-weight: bold; width: 40px;">${idx + 1}º</td>
                    <td style="text-align: center; width: 85px;"><code>${escapeHtml(fg.cod_familia || '-')}</code></td>
                    <td><strong>${escapeHtml(fg.nome_familia)}</strong></td>
                    <td style="text-align: right; font-weight: bold; color: #dc2626; width: 95px;">${(fg.qtd_pecas || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} un.</td>
                    <td style="text-align: center; width: 75px; font-weight: 600;">${fg.qtd_os || 0} OS</td>
                    <td style="text-align: right; font-weight: 600; width: 110px;">R$ ${formatMoney(fg.valor_total || 0)}</td>
                    <td style="text-align: right; width: 75px; color: #64748b; font-size: 7.5pt; font-weight: bold;">${partPecas}%</td>
                </tr>
            `;
        }).join('');
    } else {
        familiasGarantiaRowsHtml = `
            <tr>
                <td colspan="7" style="text-align: center; color: #64748b; padding: 10px; font-style: italic;">
                    Nenhuma lente / família foi emitida em garantia no período selecionado.
                </td>
            </tr>
        `;
    }

    // Agrupamento por Clientes
    const clientesMap = {};
    ordensServico.forEach(os => {
        const key = os.cod_pessoa || os.cliente_nome || 'outros';
        if (!clientesMap[key]) {
            clientesMap[key] = {
                cod_pessoa: os.cod_pessoa,
                cliente_identificador: os.cliente_identificador,
                cliente_nome: os.cliente_nome,
                ordens: [],
                total: 0.0,
                total_icms: 0.0
            };
        }
        clientesMap[key].ordens.push(os);
        clientesMap[key].total += (os.total || 0);
        clientesMap[key].total_icms += (os.total_icms || 0);
    });

    const clientesList = Object.values(clientesMap).sort((a, b) => {
        return (a.cliente_nome || '').localeCompare(b.cliente_nome || '', 'pt-BR');
    });

    let clientSectionsHtml = '';
    if (clientesList.length > 0) {
        clientSectionsHtml = clientesList.map((client) => {
            const ordens = client.ordens;
            const rowsHtml = ordens.map(os => {
                const famsText = (os.familias && os.familias.length > 0) 
                    ? os.familias.join(' • ') 
                    : '<span style="color: #94a3b8; font-style: italic;">Sem família vinculada</span>';

                return `
                    <tr style="background-color: #fff7ed;">
                        <td style="text-align: center; font-weight: bold; width: 90px;">
                            #${escapeHtml(os.numero_os)}
                            <div style="font-size: 6.8pt; color: #64748b;">ID ${escapeHtml(os.cod_ordemservico)}</div>
                        </td>
                        <td style="text-align: center; white-space: nowrap; width: 75px;">${formatDateBR(os.data_emissao)}</td>
                        <td style="width: 180px;">
                            <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                                <span class="badge" style="border-color: #ea580c; color: #c2410c; font-weight: bold; background: #ffedd5; font-size: 6.8pt; padding: 1px 4px;">🛡️ GARANTIA</span>
                                <span style="font-weight: 600; font-size: 7.2pt;">${escapeHtml(os.cod_naturezaoperacao || '')}</span>
                            </div>
                            <div style="font-size: 6.8pt; color: #64748b; line-height: 1.1; margin-top: 1px;">
                                ${escapeHtml(os.natureza_descricao || '')}
                            </div>
                        </td>
                        <td style="font-size: 7.2pt; line-height: 1.25;">
                            <strong style="color: #9a3412;">${famsText}</strong>
                        </td>
                        <td style="text-align: right; white-space: nowrap; color: #059669; font-weight: 600; width: 90px;">
                            R$ ${formatMoney(os.total_icms)}
                        </td>
                        <td style="text-align: right; white-space: nowrap; font-weight: bold; color: #b91c1c; width: 105px;">
                            R$ ${formatMoney(os.total)}
                        </td>
                    </tr>
                `;
            }).join('');

            return `
                <div style="margin-bottom: 10px; page-break-inside: avoid; border: 1px solid #fed7aa; border-radius: 4px; overflow: hidden;">
                    <!-- Cabeçalho do Cliente -->
                    <div style="background-color: #fff7ed; padding: 5px 10px; border-bottom: 1px solid #fed7aa; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 9.5pt;">👤</span>
                            <div>
                                <span style="font-weight: 700; font-size: 8.5pt; color: #0f172a;">${escapeHtml(client.cliente_nome)}</span>
                                ${client.cliente_identificador ? `<span style="font-size: 7.5pt; color: #64748b; margin-left: 4px;">(Cód: ${escapeHtml(client.cliente_identificador)})</span>` : ''}
                            </div>
                            <span class="badge" style="background: #ffedd5; border: 1px solid #ea580c; color: #c2410c; font-weight: bold; font-size: 6.8pt; padding: 1px 5px;">
                                🛡️ ${ordens.length} Garantia${ordens.length > 1 ? 's' : ''}
                            </span>
                        </div>
                        <div style="display: flex; gap: 12px; align-items: center; font-size: 7.8pt;">
                            <span style="color: #475569;">Volume: <strong>${ordens.length} OS${ordens.length > 1 ? 's' : ''}</strong></span>
                            <span style="color: #059669;">ICMS: <strong>R$ ${formatMoney(client.total_icms)}</strong></span>
                            <span style="color: #b91c1c; font-weight: 700;">Subtotal: <strong>R$ ${formatMoney(client.total)}</strong></span>
                        </div>
                    </div>

                    <!-- Tabela de OSs do Cliente -->
                    <table class="client-print-table" style="font-size: 7.2pt; border: none; margin: 0;">
                        <thead>
                            <tr style="background-color: #fffbeb !important;">
                                <th style="width: 90px; text-align: center;">Nº da OS</th>
                                <th style="width: 75px; text-align: center;">Emissão</th>
                                <th style="width: 180px;">Operação Fiscal (CFOP)</th>
                                <th>Famílias das Lentes / Produtos</th>
                                <th style="width: 90px; text-align: right;">ICMS (R$)</th>
                                <th style="width: 105px; text-align: right;">Total (R$)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                        ${ordens.length > 1 ? `
                            <tfoot>
                                <tr style="background-color: #fffbeb; font-weight: 600;">
                                    <td colspan="4" style="text-align: right; font-size: 7pt; color: #475569;">
                                        Subtotal do Cliente (${ordens.length} OSs em Garantia):
                                    </td>
                                    <td style="text-align: right; color: #059669;">R$ ${formatMoney(client.total_icms)}</td>
                                    <td style="text-align: right; color: #b91c1c; font-weight: 700;">R$ ${formatMoney(client.total)}</td>
                                </tr>
                            </tfoot>
                        ` : ''}
                    </table>
                </div>
            `;
        }).join('');
    } else {
        clientSectionsHtml = `
            <div style="text-align: center; color: #64748b; padding: 14px; border: 1px dashed #cbd5e1; border-radius: 4px;">
                Nenhuma ordem de serviço com Operações Fiscais 5.949-4, 5.949-3 ou 6.949-4 localizada para os parâmetros informados.
            </div>
        `;
    }

    printOsReportContainer.innerHTML = `
        <div class="client-print-report" style="padding: 10px 14px;">
            <!-- Cabeçalho Executivo -->
            <div class="client-print-header">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <div style="font-size: 8pt; font-weight: 700; color: #2563eb; text-transform: uppercase; letter-spacing: 0.5px;">
                            Aspheric Analytics • Gestão de Laboratório Óptico & Ordens de Serviço
                        </div>
                        <h1 class="client-print-title" style="margin-top: 2px; font-size: 13.5pt;">
                            RELATÓRIO DE ORDENS DE SERVIÇO EM GARANTIA (5.949-4 / 5.949-3 / 6.949-4)
                        </h1>
                        <div style="font-size: 8.5pt; color: #475569; margin-top: 2px;">
                            <strong>Período:</strong> ${escapeHtml(periodText)} | <strong>Filtro Fiscal:</strong> Operações 5.949-4, 5.949-3 e 6.949-4 (Garantia / Troca / Revisão)
                            ${filtros.cliente ? ` | <strong>Cliente:</strong> ${escapeHtml(filtros.cliente)}` : ''}
                        </div>
                    </div>
                    <div style="text-align: right; font-size: 8.5pt; color: #475569; min-width: 175px;">
                        <div>Emissão: <strong>${emissaoStr}</strong></div>
                        <div>Clientes: <strong>${clientesList.length}</strong></div>
                        <div>Total OSs: <strong style="color: #dc2626;">${totalOSCalc}</strong></div>
                        <div>Operações: <strong style="color: #7c3aed;">5.949-4 / -3 / 6.949-4</strong></div>
                    </div>
                </div>

                <!-- Painel de Indicadores Executivos -->
                <div class="client-print-stats" style="grid-template-columns: repeat(6, 1fr); margin-top: 10px; margin-bottom: 6px; gap: 6px;">
                    <div class="client-print-stat-box">
                        <span class="client-print-stat-label">Total de OSs (Garantia)</span>
                        <span class="client-print-stat-value" style="color: #1e3a8a;">${totalOSCalc.toLocaleString('pt-BR')}</span>
                    </div>
                    <div class="client-print-stat-box">
                        <span class="client-print-stat-label">Clientes Atendidos</span>
                        <span class="client-print-stat-value" style="color: #2563eb;">${clientesList.length}</span>
                    </div>
                    <div class="client-print-stat-box" style="border-color: #fed7aa; background-color: #fff7ed;">
                        <span class="client-print-stat-label" style="color: #c2410c;">Lentes em Garantia</span>
                        <span class="client-print-stat-value" style="color: #dc2626;">${totalGarPecasCalc.toLocaleString('pt-BR')} un.</span>
                    </div>
                    <div class="client-print-stat-box" style="border-color: #fed7aa; background-color: #fff7ed;">
                        <span class="client-print-stat-label" style="color: #c2410c;">Custo / Valor Garantia</span>
                        <span class="client-print-stat-value" style="color: #b91c1c;">R$ ${formatMoney(totalGarValCalc)}</span>
                    </div>
                    <div class="client-print-stat-box">
                        <span class="client-print-stat-label">Total ICMS</span>
                        <span class="client-print-stat-value" style="color: #059669;">R$ ${formatMoney(totalICMSCalc)}</span>
                    </div>
                    <div class="client-print-stat-box">
                        <span class="client-print-stat-label">Operações Fiscais</span>
                        <span class="client-print-stat-value" style="color: #7c3aed; font-size: 8.5pt;">5.949-4 / 5.949-3 / 6.949-4</span>
                    </div>
                </div>
            </div>

            <!-- SEÇÃO DE DESTAQUE: FAMÍLIAS DE LENTES EMITIDAS EM GARANTIA -->
            <div style="margin-bottom: 14px; page-break-inside: avoid;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <h2 style="font-size: 9.5pt; font-weight: 700; color: #9a3412; text-transform: uppercase; margin: 0; display: flex; align-items: center; gap: 4px;">
                        <span>🛡️</span>
                        <span>Famílias de Lentes Emitidas em Garantia no Período Selecionado (${familiasGarantia.length} famílias)</span>
                    </h2>
                    <span style="font-size: 7.5pt; color: #64748b;">Consolidado de peças e OSs em garantia</span>
                </div>
                <table class="client-print-table" style="font-size: 7.5pt; border: 1px solid #fed7aa;">
                    <thead>
                        <tr style="background-color: #ffedd5 !important;">
                            <th style="width: 40px; text-align: center;">#</th>
                            <th style="width: 85px; text-align: center;">Cód. Família</th>
                            <th>Descrição da Família da Lente</th>
                            <th style="width: 95px; text-align: right;">Peças (Garantia)</th>
                            <th style="width: 75px; text-align: center;">Qtd OSs</th>
                            <th style="width: 110px; text-align: right;">Valor Registrado</th>
                            <th style="width: 75px; text-align: right;">% Volume</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${familiasGarantiaRowsHtml}
                    </tbody>
                    ${familiasGarantia.length > 0 ? `
                        <tfoot>
                            <tr style="background-color: #fff7ed !important; font-weight: bold;">
                                <td colspan="3" style="text-align: right;">Totalizador de Famílias em Garantia:</td>
                                <td style="text-align: right; color: #dc2626;">${totalGarPecasCalc.toLocaleString('pt-BR')} un.</td>
                                <td style="text-align: center;">${totalOSCalc} OS</td>
                                <td style="text-align: right; color: #b91c1c;">R$ ${formatMoney(totalGarValCalc)}</td>
                                <td style="text-align: right;">100.0%</td>
                            </tr>
                        </tfoot>
                    ` : ''}
                </table>
            </div>

            <!-- SEÇÃO DE RELAÇÃO DAS ORDENS DE SERVIÇO AGRUPADAS POR CLIENTE -->
            <div style="margin-top: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <h2 style="font-size: 9.5pt; font-weight: 700; color: #1e3a8a; text-transform: uppercase; margin: 0; display: flex; align-items: center; gap: 4px;">
                        <span>👥</span>
                        <span>Ordens de Serviço Agrupadas por Cliente (${clientesList.length} clientes • ${totalOSCalc} OSs em garantia)</span>
                    </h2>
                    <span style="font-size: 7.5pt; color: #64748b;">Agrupamento alfabético por cliente • CFOPs 5.949-4 / 5.949-3 / 6.949-4</span>
                </div>
                
                ${clientSectionsHtml}

                <!-- Totais Consolidados Gerais no Encerramento -->
                <div style="background-color: #0f172a; color: #ffffff; padding: 7px 12px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 8pt; font-weight: bold; page-break-inside: avoid;">
                    <div>
                        TOTAL GERAL CONSOLIDADO: ${clientesList.length} Clientes • ${totalOSCalc} Ordens de Serviço (Operações 5.949-4 / 5.949-3 / 6.949-4)
                    </div>
                    <div style="display: flex; gap: 16px; align-items: center;">
                        <span style="color: #6ee7b7;">Total ICMS: R$ ${formatMoney(totalICMSCalc)}</span>
                        <span style="color: #f87171; font-size: 9pt;">Total Geral Garantia: R$ ${formatMoney(totalFatCalc)}</span>
                    </div>
                </div>
            </div>

            <!-- Rodapé Formal do Relatório -->
            <div style="margin-top: 14px; border-top: 1px solid #cbd5e1; padding-top: 6px; font-size: 7pt; color: #64748b; display: flex; justify-content: space-between; align-items: center; page-break-inside: avoid;">
                <div>
                    Documento emitido eletronicamente pelo módulo <strong>Aspheric Analytics</strong> em ${emissaoStr}.
                </div>
                <div style="font-style: italic;">
                    Relatório Executivo de Ordens de Serviço em Garantia (5.949-4 / 5.949-3 / 6.949-4)
                </div>
            </div>
        </div>
    `;

    document.body.classList.remove('printing-clientes-familia', 'printing-client-items', 'printing-family-orders');
    document.body.classList.add('printing-os-report');

    const cleanup = () => {
        document.body.classList.remove('printing-os-report');
        if (printOsReportContainer) printOsReportContainer.innerHTML = '';
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    setTimeout(() => {
        window.print();
        setTimeout(cleanup, 2500);
    }, 150);
}

async function handlePrintOSReportClick() {
    // Utiliza os parâmetros da última pesquisa realizada ou os valores atuais da tela sem alterar nenhum campo
    const activeParams = lastOSSearchParams || {
        query: searchInput ? searchInput.value.trim() : '',
        cliente: (function() {
            if (selectedSearchCodPessoa) return String(selectedSearchCodPessoa);
            if (osSearchClientInput) {
                let rawVal = osSearchClientInput.value.trim();
                if (rawVal.startsWith('Cód:')) return rawVal.split(' - ')[0].replace('Cód:', '').trim();
                if (rawVal.startsWith('#')) return rawVal.split(' - ')[0].replace('#', '').trim();
                return rawVal;
            }
            return '';
        })(),
        dtIni: osDateInicio ? osDateInicio.value : '',
        dtFim: osDateFim ? osDateFim.value : '',
        tipoOs: osTipoFiltro ? osTipoFiltro.value : 'todas'
    };

    const query = activeParams.query || '';
    const cliente = activeParams.cliente || '';
    const dtIni = activeParams.dtIni || '';
    const dtFim = activeParams.dtFim || '';

    if (btnPrintOSReport) {
        btnPrintOSReport.disabled = true;
        btnPrintOSReport.innerHTML = '<span>⏳ Gerando Relatório...</span>';
    }

    try {
        // Busca com base na data pesquisada pelo usuário
        let url = `/api/os/relatorio?limit=3000`;
        if (query) url += `&search=${encodeURIComponent(query)}`;
        if (cliente) url += `&cliente=${encodeURIComponent(cliente)}`;
        if (dtIni) url += `&data_inicio=${encodeURIComponent(dtIni)}`;
        if (dtFim) url += `&data_fim=${encodeURIComponent(dtFim)}`;

        const res = await fetch(url);
        if (!res.ok) {
            const errDetail = await res.text();
            throw new Error(`Erro ao gerar relatório de OS (${res.status}): ${errDetail}`);
        }

        const reportData = await res.json();
        if (!reportData.ordens_servico || reportData.ordens_servico.length === 0) {
            showToast('Nenhuma ordem de serviço com Operações Fiscais 5.949-4, 5.949-3 ou 6.949-4 localizada para os parâmetros informados.', 'warning');
            return;
        }

        printOSReport(reportData);
    } catch (e) {
        console.error('Erro ao emitir relatório de OS:', e);
        showToast(e.message || 'Erro ao carregar relatório.', 'error');
    } finally {
        if (btnPrintOSReport) {
            btnPrintOSReport.disabled = false;
            btnPrintOSReport.innerHTML = '<span>🖨️</span><span>Imprimir Relatório</span>';
        }
    }
}

if (btnPrintOSReport) {
    btnPrintOSReport.addEventListener('click', handlePrintOSReportClick);
}

if (osTipoFiltro) {
    osTipoFiltro.addEventListener('change', () => {
        searchOS();
    });
}

// Initialize Application (Carrega apenas a configuração do sistema e selects, sem disparar buscas pesadas no banco)
document.addEventListener('DOMContentLoaded', async () => {
    try { await loadDatabaseSelector(); } catch (e) { console.error('Erro loadDatabaseSelector:', e); }
    try { await checkStatus(); } catch (e) { console.error('Erro checkStatus:', e); }
    try { await loadNaturezas(); } catch (e) { console.error('Erro loadNaturezas:', e); }
    try { await loadTiposOperacao(); } catch (e) { console.error('Erro loadTiposOperacao:', e); }
    try { await loadCidades(); } catch (e) { console.error('Erro loadCidades:', e); }
    try { await loadTopCustomerTiposOperacao(); } catch (e) { console.error('Erro loadTopCustomerTiposOperacao:', e); }
    try { await loadFamiliaTiposOperacao(); } catch (e) { console.error('Erro loadFamiliaTiposOperacao:', e); }
});


