// Estado em memória (cache local, recarregado da API)
const state = {
  produtos: [],
  templates: {},      // { templateNome: [{codigo,nome,quantidade}] }
  eventos: [],
  historico: [],
  status: [],
  eventoAtivoId: null,
  scannedCodesThisSession: new Set(),
  pendingScan: null,  // produto lido aguardando confirmação
  templateItensEmEdicao: [], // itens sendo montados no form de template
  eventoItensEmEdicao: [],
  eventoEmEdicaoId: null,
  html5QrCode: null,
  scanning: false
};

/* ---------------- Navegação ---------------- */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === id));
  if (id !== 'screen-scanner' && state.scanning) stopScanner();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

function toast(msg, isError) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.background = isError ? '#991b1b' : '#1f2430';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 3000);
}

/* ---------------- Carregamento inicial ---------------- */

async function loadAll() {
  try {
    const [produtos, templates, eventos, historico, status] = await Promise.all([
      Api.getProdutos(), Api.getTemplates(), Api.getEventos(), Api.getHistorico(), Api.getStatus()
    ]);
    state.produtos = produtos;
    state.templates = templates;
    state.eventos = eventos;
    state.historico = historico;
    state.status = status;
    renderProdutos();
    renderTemplateSelectors();
    renderEventoSelects();
    renderHistoricoEStatus();
  } catch (err) {
    toast('Erro ao carregar dados: ' + err.message, true);
  }
}

/* ================= PRODUTOS ================= */

const formProduto = document.getElementById('form-produto');
const pCategoria = document.getElementById('p-categoria');
const pContemField = document.getElementById('p-contem-field');

pCategoria.addEventListener('change', updateContemVisibility);
function updateContemVisibility() {
  pContemField.classList.toggle('hidden', pCategoria.value === 'Avulso');
}
updateContemVisibility();

formProduto.addEventListener('submit', async (e) => {
  e.preventDefault();
  const produto = {
    codigo: document.getElementById('p-codigo').value.trim(),
    nome: document.getElementById('p-nome').value.trim(),
    categoria: pCategoria.value,
    contem: document.getElementById('p-contem').value.split(',').map(s => s.trim()).filter(Boolean),
    quantidade: document.getElementById('p-quantidade').value.trim(),
    retornoObrigatorio: document.getElementById('p-retorno').value
  };
  try {
    await Api.salvarProduto(produto);
    toast('Produto salvo.');
    formProduto.reset();
    document.getElementById('produto-editando').value = '';
    document.getElementById('btn-cancelar-produto').classList.add('hidden');
    updateContemVisibility();
    await loadAll();
  } catch (err) {
    toast('Erro ao salvar produto: ' + err.message, true);
  }
});

document.getElementById('btn-cancelar-produto').addEventListener('click', () => {
  formProduto.reset();
  document.getElementById('produto-editando').value = '';
  document.getElementById('btn-cancelar-produto').classList.add('hidden');
  updateContemVisibility();
});

function renderProdutos() {
  const tbody = document.getElementById('produtos-tbody');
  tbody.innerHTML = '';
  state.produtos.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(p.codigo)}</td>
      <td>${escapeHtml(p.nome)}</td>
      <td>${escapeHtml(p.categoria)}</td>
      <td>${escapeHtml(p.retornoObrigatorio)}</td>
      <td>
        <button data-edit="${p.codigo}">Editar</button>
        <button data-del="${p.codigo}">Excluir</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => editarProduto(btn.dataset.edit));
  });
  tbody.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => excluirProduto(btn.dataset.del));
  });
}

function editarProduto(codigo) {
  const p = state.produtos.find(x => x.codigo === codigo);
  if (!p) return;
  document.getElementById('produto-editando').value = p.codigo;
  document.getElementById('p-codigo').value = p.codigo;
  document.getElementById('p-nome').value = p.nome;
  document.getElementById('p-categoria').value = p.categoria;
  document.getElementById('p-contem').value = (p.contem || []).join(',');
  document.getElementById('p-quantidade').value = p.quantidade;
  document.getElementById('p-retorno').value = p.retornoObrigatorio;
  document.getElementById('btn-cancelar-produto').classList.remove('hidden');
  updateContemVisibility();
  showScreen('screen-produtos');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function excluirProduto(codigo) {
  if (!confirm(`Excluir o produto "${codigo}"?`)) return;
  try {
    await Api.excluirProduto(codigo);
    toast('Produto excluído.');
    await loadAll();
  } catch (err) {
    toast('Erro ao excluir: ' + err.message, true);
  }
}

/* ================= TEMPLATES ================= */

function renderTemplateSelectors() {
  const itemSelect = document.getElementById('t-item-select');
  itemSelect.innerHTML = state.produtos.map(p => `<option value="${p.codigo}">${escapeHtml(p.nome)} (${p.codigo})</option>`).join('');

  const evTemplate = document.getElementById('ev-template');
  evTemplate.innerHTML = Object.keys(state.templates).map(t => `<option value="${t}">${t}</option>`).join('');
}

document.getElementById('t-nome').addEventListener('change', carregarTemplateParaEdicao);
function carregarTemplateParaEdicao() {
  const nome = document.getElementById('t-nome').value;
  state.templateItensEmEdicao = (state.templates[nome] || []).map(i => ({ ...i }));
  renderTemplateItensEdicao();
}
carregarTemplateParaEdicao();

document.getElementById('btn-add-template-item').addEventListener('click', () => {
  const select = document.getElementById('t-item-select');
  const codigo = select.value;
  const produto = state.produtos.find(p => p.codigo === codigo);
  if (!produto) { toast('Cadastre produtos antes de montar o template.', true); return; }
  const qtd = document.getElementById('t-item-qtd').value.trim() || '1';
  state.templateItensEmEdicao.push({ codigo, nome: produto.nome, quantidade: qtd });
  document.getElementById('t-item-qtd').value = '';
  renderTemplateItensEdicao();
});

function renderTemplateItensEdicao() {
  const ul = document.getElementById('template-itens-lista');
  ul.innerHTML = '';
  state.templateItensEmEdicao.forEach((item, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(item.nome)} — ${escapeHtml(String(item.quantidade))}</span><button data-idx="${idx}">remover</button>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.templateItensEmEdicao.splice(Number(btn.dataset.idx), 1);
      renderTemplateItensEdicao();
    });
  });
}

document.getElementById('btn-salvar-template').addEventListener('click', async () => {
  const nome = document.getElementById('t-nome').value;
  try {
    await Api.salvarTemplate(nome, state.templateItensEmEdicao);
    toast('Template salvo.');
    await loadAll();
    carregarTemplateParaEdicao();
  } catch (err) {
    toast('Erro ao salvar template: ' + err.message, true);
  }
});

/* ---- Criar evento a partir de template ---- */

document.getElementById('btn-carregar-template-evento').addEventListener('click', () => {
  const templateNome = document.getElementById('ev-template').value;
  state.eventoItensEmEdicao = (state.templates[templateNome] || []).map(i => ({ ...i }));
  state.eventoEmEdicaoId = null;
  renderEventoItensEdicao();
  document.getElementById('btn-salvar-evento').classList.remove('hidden');
});

function renderEventoItensEdicao() {
  const ul = document.getElementById('evento-itens-lista');
  ul.innerHTML = '';
  state.eventoItensEmEdicao.forEach((item, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(item.nome)} — ${escapeHtml(String(item.quantidade))}</span><button data-idx="${idx}">remover</button>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.eventoItensEmEdicao.splice(Number(btn.dataset.idx), 1);
      renderEventoItensEdicao();
    });
  });
}

document.getElementById('btn-salvar-evento').addEventListener('click', async () => {
  const nome = document.getElementById('ev-nome').value.trim();
  const templateUsado = document.getElementById('ev-template').value;
  if (!nome) { toast('Dê um nome ao evento.', true); return; }
  try {
    await Api.criarEvento(nome, templateUsado, state.eventoItensEmEdicao);
    toast('Evento criado.');
    document.getElementById('ev-nome').value = '';
    state.eventoItensEmEdicao = [];
    renderEventoItensEdicao();
    document.getElementById('btn-salvar-evento').classList.add('hidden');
    await loadAll();
    showScreen('screen-scanner');
  } catch (err) {
    toast('Erro ao criar evento: ' + err.message, true);
  }
});

/* ================= EVENTO ATIVO / SCANNER ================= */

function renderEventoSelects() {
  const opts = state.eventos
    .slice().reverse()
    .map(ev => `<option value="${ev.id}">${escapeHtml(ev.nome)}</option>`).join('');
  const scannerSelect = document.getElementById('evento-select');
  const confirmSelect = document.getElementById('confirm-evento');
  scannerSelect.innerHTML = opts || '<option value="">Nenhum evento criado</option>';
  confirmSelect.innerHTML = opts || '<option value="">Nenhum evento criado</option>';
  if (state.eventos.length) {
    state.eventoAtivoId = scannerSelect.value || state.eventos[state.eventos.length - 1].id;
    scannerSelect.value = state.eventoAtivoId;
  }
  renderListaEsperada();
}

document.getElementById('evento-select').addEventListener('change', (e) => {
  state.eventoAtivoId = e.target.value;
  state.scannedCodesThisSession.clear();
  renderListaEsperada();
});

function renderListaEsperada() {
  const box = document.getElementById('lista-esperada');
  const ul = document.getElementById('expected-items');
  const evento = state.eventos.find(ev => ev.id === state.eventoAtivoId);
  if (!evento || !evento.itens || !evento.itens.length) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  ul.innerHTML = '';
  evento.itens.forEach(item => {
    const li = document.createElement('li');
    const foiLido = state.scannedCodesThisSession.has(item.codigo);
    li.className = foiLido ? 'scanned' : '';
    li.innerHTML = `<span>${escapeHtml(item.nome)}</span><span>${escapeHtml(String(item.quantidade))}</span>`;
    ul.appendChild(li);
  });
}

/* ---- Câmera QR ---- */

const btnToggleScan = document.getElementById('btn-toggle-scan');
btnToggleScan.addEventListener('click', () => {
  if (state.scanning) stopScanner(); else startScanner();
});

function startScanner() {
  if (!state.eventoAtivoId) {
    toast('Crie e selecione um evento antes de bipar.', true);
    return;
  }
  state.html5QrCode = state.html5QrCode || new Html5Qrcode('reader');
  const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
  state.html5QrCode.start(
    { facingMode: 'environment' },
    config,
    onScanSuccess,
    () => {} // erro de frame sem QR, ignorar
  ).then(() => {
    state.scanning = true;
    btnToggleScan.textContent = 'Parar câmera';
  }).catch(err => {
    toast('Não foi possível abrir a câmera: ' + err, true);
  });
}

function stopScanner() {
  if (state.html5QrCode && state.scanning) {
    state.html5QrCode.stop().then(() => {
      state.scanning = false;
      btnToggleScan.textContent = 'Iniciar câmera';
    }).catch(() => {});
  } else {
    state.scanning = false;
    btnToggleScan.textContent = 'Iniciar câmera';
  }
}

function onScanSuccess(decodedText) {
  const codigo = decodedText.trim();
  const produto = state.produtos.find(p => p.codigo === codigo);
  if (!produto) {
    toast(`QR não reconhecido: ${codigo}`, true);
    return;
  }
  stopScanner();
  abrirConfirmacao(produto);
}

/* ================= CONFIRMAÇÃO ================= */

function abrirConfirmacao(produto) {
  state.pendingScan = produto;
  document.getElementById('confirm-nome').textContent = produto.nome;
  document.getElementById('confirm-detalhes').textContent =
    `Código: ${produto.codigo} · Categoria: ${produto.categoria} · Qtd: ${produto.quantidade || '-'}`;
  const flag = document.getElementById('confirm-retorno-flag');
  if (String(produto.retornoObrigatorio).toLowerCase() === 'sim') {
    flag.textContent = 'Retorno obrigatório';
    flag.className = 'badge';
  } else if (String(produto.retornoObrigatorio).toLowerCase() === 'parcial') {
    flag.textContent = 'Retorno parcial';
    flag.className = 'badge opcional';
  } else {
    flag.textContent = 'Retorno não obrigatório (consumível)';
    flag.className = 'badge opcional';
  }
  document.getElementById('confirm-evento').value = state.eventoAtivoId || '';
  showScreen('screen-confirmacao');
}

document.getElementById('btn-cancelar-confirm').addEventListener('click', () => {
  state.pendingScan = null;
  showScreen('screen-scanner');
  startScanner();
});

document.getElementById('btn-saida').addEventListener('click', () => confirmarBipagem('saida'));
document.getElementById('btn-retorno').addEventListener('click', () => confirmarBipagem('retorno'));

async function confirmarBipagem(tipo) {
  const produto = state.pendingScan;
  if (!produto) return;
  const eventoId = document.getElementById('confirm-evento').value;
  const evento = state.eventos.find(ev => ev.id === eventoId);
  try {
    await Api.bipar(produto.codigo, tipo, evento ? evento.nome : '');
    toast(`${tipo === 'saida' ? 'Saída' : 'Retorno'} registrada: ${produto.nome}`);
    state.scannedCodesThisSession.add(produto.codigo);
    state.pendingScan = null;
    await loadAll();
    showScreen('screen-scanner');
    document.getElementById('evento-select').value = eventoId;
    state.eventoAtivoId = eventoId;
    renderListaEsperada();
    startScanner();
  } catch (err) {
    toast('Erro ao registrar: ' + err.message, true);
  }
}

/* ================= HISTÓRICO / STATUS ================= */

function renderHistoricoEStatus() {
  const alertas = state.status.filter(s => s.alerta);
  const esperados = state.status.filter(s => !s.alerta);

  const ulAlertas = document.getElementById('lista-alertas');
  ulAlertas.innerHTML = alertas.length
    ? alertas.map(a => `<li class="alerta"><strong>${escapeHtml(a.nome)}</strong><br>Saiu no evento "${escapeHtml(a.evento || '-')}" em ${formatDate(a.desde)}</li>`).join('')
    : '<li>Nenhum item pendente. 🎉</li>';

  const ulEsperados = document.getElementById('lista-esperados');
  ulEsperados.innerHTML = esperados.length
    ? esperados.map(a => `<li><strong>${escapeHtml(a.nome)}</strong><br>Evento "${escapeHtml(a.evento || '-')}" em ${formatDate(a.desde)}</li>`).join('')
    : '<li>Nenhum.</li>';

  const tbody = document.getElementById('historico-tbody');
  const rows = state.historico.slice().reverse().slice(0, 200);
  tbody.innerHTML = rows.map(h => `
    <tr>
      <td>${formatDate(h.timestamp)}</td>
      <td>${escapeHtml(h.nomeItem)}</td>
      <td>${h.tipo === 'saida' ? 'Saída' : 'Retorno'}</td>
      <td>${escapeHtml(h.evento || '-')}</td>
    </tr>`).join('');
}

/* ================= Utils ================= */

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatDate(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleString('pt-BR');
}

loadAll();
