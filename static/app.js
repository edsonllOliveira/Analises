// State Management
let naturezasList = [];
let currentOS = null;
let currentDbKey = 'producao';

// DOM Elements
const dbSelect = document.getElementById('dbSelect');
const dbStatusBadge = document.getElementById('dbStatusBadge');
const dbStatusText = document.getElementById('dbStatusText');
const btnRefreshStatus = document.getElementById('btnRefreshStatus');
const searchInput = document.getElementById('searchInput');
const limitSelect = document.getElementById('limitSelect');
const btnSearch = document.getElementById('btnSearch');
const osTableBody = document.getElementById('osTableBody');
const resultCountBadge = document.getElementById('resultCountBadge');

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
    
    btnSearch.disabled = true;
    btnSearch.innerHTML = '<span>Carregando...</span>';
    
    try {
        let url = `/api/os?limit=${limit}`;
        if (query) url += `&search=${encodeURIComponent(query)}`;
        if (cliente) url += `&cliente=${encodeURIComponent(cliente)}`;
        if (dtIni) url += `&data_inicio=${encodeURIComponent(dtIni)}`;
        if (dtFim) url += `&data_fim=${encodeURIComponent(dtFim)}`;
        
        const res = await fetch(url);
        if (!res.ok) throw new Error('Erro ao buscar ordens de serviço.');
        
        const data = await res.json();
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
                <td colspan="8" class="text-center empty-state">
                    Nenhuma Ordem de Serviço encontrada com os critérios informados.
                </td>
            </tr>
        `;
        return;
    }
    
    osTableBody.innerHTML = list.map(os => `
        <tr>
            <td><strong>#${os.numero_os}</strong></td>
            <td>${os.cod_ordemservico}</td>
            <td>${os.cliente_nome}</td>
            <td>${formatDateBR(os.data_emissao)}</td>
            <td>
                <span class="badge" title="${os.natureza_descricao || ''}">
                    ${os.cod_naturezaoperacao || 'Sem CFOP'}
                </span>
            </td>
            <td><strong>R$ ${formatMoney(os.total)}</strong></td>
            <td style="color: #10b981;"><strong>R$ ${formatMoney(os.total_icms)}</strong></td>
            <td class="text-center">
                <button class="btn btn-primary btn-sm" onclick="openEditModal(${os.cod_ordemservico}, ${os.cod_empresa})">
                    ✏️ Editar OS
                </button>
            </td>
        </tr>
    `).join('');
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
    
    const modalTotalICMS = document.getElementById('modalTotalICMS');
    const modalTotalISSQN = document.getElementById('modalTotalISSQN');
    const modalTotalIPI = document.getElementById('modalTotalIPI');
    const modalTotalPIS = document.getElementById('modalTotalPIS');
    const modalTotalCOFINS = document.getElementById('modalTotalCOFINS');
    const modalTotalICMSST = document.getElementById('modalTotalICMSST');

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
    
    // Alíquota efetiva de ICMS pós diferimento
    const aliqEfetiva = Math.max(0, aliqNominal * (1.0 - aliqDif / 100.0));
    const vlicms = base * (aliqEfetiva / 100.0);
    
    baseEl.value = base.toFixed(2);
    vlicmsEl.value = vlicms.toFixed(2);
    
    recalculateTotalsHeader();
}

// Manual edit of Base ICMS
function calcRowICMSManual(idx) {
    const aliqEl = document.getElementById(`aliqicms_${idx}`);
    const aliqdifEl = document.getElementById(`aliqdificms_${idx}`);
    const baseEl = document.getElementById(`baseicms_${idx}`);
    const vlicmsEl = document.getElementById(`vlicms_${idx}`);
    
    const aliqNominal = parseFloat(aliqEl.value) || 0;
    const aliqDif = aliqdifEl ? (parseFloat(aliqdifEl.value) || 0) : 0;
    const base = parseFloat(baseEl.value) || 0;
    
    const aliqEfetiva = Math.max(0, aliqNominal * (1.0 - aliqDif / 100.0));
    const vlicms = base * (aliqEfetiva / 100.0);
    
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
    let sumICMS = 0;
    let sumISSQN = 0;
    let sumIPI = 0;
    let sumPIS = 0;
    let sumCOFINS = 0;
    
    currentOS.items.forEach((it, idx) => {
        const totalEl = document.getElementById(`total_${idx}`);
        const vlicmsEl = document.getElementById(`vlicms_${idx}`);
        const vlissEl = document.getElementById(`vliss_${idx}`);
        const vlipiEl = document.getElementById(`vlipi_${idx}`);
        const vlpisEl = document.getElementById(`vlpis_${idx}`);
        const vlcofinsEl = document.getElementById(`vlcofins_${idx}`);
        
        const rowTotal = totalEl ? (parseFloat(totalEl.value) || 0) : (it.total || 0);
        const rowICMS = vlicmsEl ? (parseFloat(vlicmsEl.value) || 0) : (it.totalicms || 0);
        const rowISS = vlissEl ? (parseFloat(vlissEl.value) || 0) : (it.totalissqn || 0);
        const rowIPI = vlipiEl ? (parseFloat(vlipiEl.value) || 0) : (it.totalipi || 0);
        const rowPIS = vlpisEl ? (parseFloat(vlpisEl.value) || 0) : (it.totalpis || 0);
        const rowCOFINS = vlcofinsEl ? (parseFloat(vlcofinsEl.value) || 0) : (it.totalcofins || 0);
        
        sumTotal += rowTotal;
        sumICMS += rowICMS;
        sumISSQN += rowISS;
        sumIPI += rowIPI;
        sumPIS += rowPIS;
        sumCOFINS += rowCOFINS;
    });
    
    const desconto = parseFloat(modalValorDesconto.value) || 0;
    const finalTotal = Math.max(0, sumTotal - desconto);
    
    modalTotalOS.value = finalTotal.toFixed(2);
    
    const modalTotalICMS = document.getElementById('modalTotalICMS');
    const modalTotalISSQN = document.getElementById('modalTotalISSQN');
    const modalTotalIPI = document.getElementById('modalTotalIPI');
    const modalTotalPIS = document.getElementById('modalTotalPIS');
    const modalTotalCOFINS = document.getElementById('modalTotalCOFINS');
    
    if (modalTotalICMS) modalTotalICMS.value = sumICMS.toFixed(2);
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
const sectionOS = document.getElementById('sectionOS');
const sectionClientes = document.getElementById('sectionClientes');
const sectionProdutos = document.getElementById('sectionProdutos');
const sectionTopClientes = document.getElementById('sectionTopClientes');

function switchActiveTab(activeBtn, activeSection) {
    [tabOS, tabClientes, tabProdutos, tabTopClientes].forEach(tab => {
        if (tab) tab.classList.remove('active');
    });
    [sectionOS, sectionClientes, sectionProdutos, sectionTopClientes].forEach(sec => {
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
    });
}

if (tabTopClientes) {
    tabTopClientes.addEventListener('click', () => {
        switchActiveTab(tabTopClientes, sectionTopClientes);
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
        
        const cleanName = escapeHtml(c.razao_social).replace(/'/g, "\\'");
        
        return `
            <tr>
                <td>
                    <a href="#" class="client-os-link" onclick="event.preventDefault(); window.filterOSByClient('${c.cod_pessoa}', '${cleanName}');" title="Clique para carregar as Ordens de Serviço (OS) deste cliente">
                        <span class="link-icon">🔍</span>
                        <strong>${escapeHtml(c.razao_social)}</strong>
                    </a>
                </td>
                <td>${escapeHtml(c.nome_fantasia || 'N/A')}</td>
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
    btnTipoOpDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownTipoOpList.classList.toggle('hidden');
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
const btnSelectAllTopCustomerTipos = document.getElementById('btnSelectAllTopCustomerTipos');
const btnClearTopCustomerTipos = document.getElementById('btnClearTopCustomerTipos');

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
    btnTopCustomerTipoOpDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownTopCustomerTipoOpList.classList.toggle('hidden');
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
    
    if (checkedCbs.length === 0) {
        lblTopCustomerTipoOpSelected.textContent = '🛒 Vendas';
    } else if (checkedCbs.length === allCbs.length) {
        lblTopCustomerTipoOpSelected.textContent = '🌐 Todos os Tipos';
    } else if (checkedCbs.length === 1) {
        const item = topCustomerTiposData.find(t => String(t.tipo) === checkedCbs[0].value);
        lblTopCustomerTipoOpSelected.textContent = item ? item.descricao : `1 Tipo Selecionado`;
    } else if (checkedCbs.length === 2 && Array.from(checkedCbs).every(c => c.value === '1' || c.value === '11')) {
        lblTopCustomerTipoOpSelected.textContent = '🛒 Vendas';
    } else {
        lblTopCustomerTipoOpSelected.textContent = `🏷️ ${checkedCbs.length} Tipos Selecionados`;
    }
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
        const res = await fetch('/api/tipos-natureza');
        if (!res.ok) return;
        topCustomerTiposData = await res.json();
        
        containerTopCustomerTiposOpCheckboxes.innerHTML = '';
        topCustomerTiposData.forEach(t => {
            const label = document.createElement('label');
            label.className = 'checkbox-option';
            const isVendaDefault = (t.tipo === 1 || t.tipo === 11);
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

        const cleanName = escapeHtml(item.nome_cliente).replace(/'/g, "\\'");

        return `
            <tr>
                <td class="text-center">
                    <span class="${rankBadgeClass}">${rank}</span>
                </td>
                <td><code>${escapeHtml(item.cod_pessoa)}</code></td>
                <td>
                    <a href="#" class="client-os-link" onclick="event.preventDefault(); window.filterOSByClient('${item.cod_pessoa}', '${cleanName}');" title="Clique para carregar as Ordens de Serviço (OS) deste cliente">
                        <span class="link-icon">🔍</span>
                        <strong>${escapeHtml(item.nome_cliente)}</strong>
                    </a>
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

// Initialize Application (Carrega apenas a configuração do sistema e selects, sem disparar buscas pesadas no banco)
document.addEventListener('DOMContentLoaded', async () => {
    await loadDatabaseSelector();
    await checkStatus();
    await loadNaturezas();
    await loadTiposOperacao();
    await loadCidades();
    await loadTopCustomerTiposOperacao();
});


