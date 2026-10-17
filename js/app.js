// Estado em memória (cache local, recarregado da API)
const state = {
  produtos: [],
  templates: {},      // { templateNome: [{codigo,nome,quantidade}] }
  eventos: [],
  historico: [],
  status: [],
  eventoAtivoId: null,
  eventoPadraoId: null,
  scannedCodesThisSession: new Set(),
  pendingScan: null,  // produto lido aguardando confirmação
  ultimoCodigo: null,
  ignorarAte: 0,
  templateItensEmEdicao: [],
  eventoItensEmEdicao: [],
  html5QrCode: null,
  scanning: false
};

const $ = (id) => document.getElementById(id);

/* ---------------- Navegação ---------------- */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  const menu = id === 'screen-confirmacao' ? 'screen-scanner' : id;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === menu));
  // A confirmação mantém a câmera ligada (pausada) para o próximo item.
  if (id !== 'screen-scanner' && id !== 'screen-confirmacao' && state.scanning) stopScanner();
  window.scrollTo({ top: 0 });
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.screen === 'screen-scanner' && state.pendingScan) return voltarAoScanner();
    state.pendingScan = null;
    showScreen(btn.dataset.screen);
  });
});

function toast(msg, isError) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('erro', !!isError);
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), isError ? 6000 : 2500);
}

/* ---------------- Carregamento inicial ---------------- */

const CACHE_KEY = 'controle-materiais:dados:v1';

function lerCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { return null; }
}
function gravarCache(dados) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(dados)); } catch (e) {}
}

function aplicarDados(d) {
  state.produtos = d.produtos || [];
  state.templates = d.templates || {};
  state.eventos = d.eventos || [];
  state.historico = d.historico || [];
  state.status = d.status || [];
  renderProdutos();
  renderTemplateSelectors();
  escolherEventoInicial();
  renderEventoCards();
  renderHistoricoEStatus();
}

// Uma chamada só ao Apps Script. Se o backend ainda for a versão antiga (sem 'tudo'),
// cai para as 5 chamadas separadas.
async function buscarDados() {
  try {
    return await Api.getTudo();
  } catch (err) {
    if (!/inv[aá]lida/i.test(err.message)) throw err;
    const [produtos, templates, eventos, historico, status] = await Promise.all([
      Api.getProdutos(), Api.getTemplates(), Api.getEventos(), Api.getHistorico(), Api.getStatus()
    ]);
    return { produtos, templates, eventos, historico, status };
  }
}

// Mostra na hora o que foi salvo da última vez e atualiza por trás.
async function loadAll() {
  $('loadbar').classList.add('on');
  try {
    const dados = await buscarDados();
    gravarCache(dados);
    aplicarDados(dados);
  } catch (err) {
    toast('Erro ao carregar dados: ' + err.message, true);
  } finally {
    $('loadbar').classList.remove('on');
  }
}

/* ================= EVENTOS (leitura do nome e exibição) ================= */

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DIAS_RECENTES = 7; // eventos passados continuam na lista por 7 dias
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Eventos importados têm o nome "dd/mm/aaaa - Fundo - Tipo (Local) [Fornecedor]".
// Eventos criados à mão não têm data nem esse formato.
function parseEvento(ev) {
  const nome = String(ev.nome || '');
  const m = nome.match(/^(\d{2})\/(\d{2})\/(\d{4}) - (.*)$/);
  if (!m) return { ev, data: null, tipo: nome, fundo: '', local: '', forn: [] };
  const data = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  let resto = m[4];
  let forn = [];
  const fm = resto.match(/\s*\[([^\]]*)\]\s*$/);
  if (fm) { forn = fm[1].split('+').map(s => s.trim()).filter(Boolean); resto = resto.slice(0, fm.index); }
  const sep = resto.indexOf(' - ');
  const fundo = (sep >= 0 ? resto.slice(0, sep) : resto).replace(/_/g, ' ').trim();
  let tipo = sep >= 0 ? resto.slice(sep + 3).trim() : '';
  let local = '';
  const lm = tipo.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (lm) { tipo = lm[1].trim(); local = lm[2].trim(); }
  return { ev, data, tipo: tipo || 'Evento', fundo, local, forn };
}

// Nome curto para listas de status/histórico: "13/11 · Colação de Grau · FUNDO".
function nomeCurto(nomeEvento) {
  if (!nomeEvento) return '—';
  const p = parseEvento({ nome: nomeEvento });
  if (!p.data) return nomeEvento;
  return `${String(p.data.getDate()).padStart(2, '0')}/${String(p.data.getMonth() + 1).padStart(2, '0')} · ${p.tipo} · ${p.fundo}`;
}

function dateBlockHtml(p) {
  if (!p.data) return '<div class="date-block sem-data"><strong>•</strong><span>sem data</span></div>';
  return `<div class="date-block"><strong>${String(p.data.getDate()).padStart(2, '0')}</strong>` +
    `<span>${MESES_CURTOS[p.data.getMonth()]}</span><small>${DIAS_SEMANA[p.data.getDay()]}</small></div>`;
}

function fornChips(p) {
  return p.forn.map(f => `<span class="chip ${f.toLowerCase() === 'viva' ? 'chip-orange' : 'chip-dark'}">${escapeHtml(f)}</span>`).join('');
}

function eventoCardHtml(id) {
  const ev = state.eventos.find(e => e.id === id);
  if (!ev) {
    return `<div class="ev-main"><div class="ev-vazio">Nenhum evento. Toque para escolher.</div></div>${chevron()}`;
  }
  const p = parseEvento(ev);
  return `${dateBlockHtml(p)}<div class="ev-main"><div class="ev-tipo">${escapeHtml(p.tipo)}</div>` +
    (p.fundo ? `<div class="ev-fundo">${escapeHtml(p.fundo)}</div>` : '') + `</div>${chevron()}`;
}

function chevron() {
  return '<svg class="ev-chevron" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
}

function escolherEventoInicial() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const itens = state.eventos.map(parseEvento);
  const futuros = itens.filter(p => p.data && p.data >= hoje).sort((a, b) => a.data - b.data);
  const manuais = itens.filter(p => !p.data);
  const passados = itens.filter(p => p.data && p.data < hoje).sort((a, b) => b.data - a.data);
  const primeiro = futuros[0] || manuais[manuais.length - 1] || passados[0];
  state.eventoPadraoId = primeiro ? primeiro.ev.id : null;
  const existe = state.eventos.some(ev => ev.id === state.eventoAtivoId);
  if (!existe) state.eventoAtivoId = state.eventoPadraoId;
}

// Evento usado na confirmação: o do retorno sugerido (de onde o item saiu) ou o ativo.
function eventoDaConfirmacao() {
  return state.eventoConfirmId || state.eventoAtivoId;
}

function renderEventoCards() {
  $('evento-card').innerHTML = eventoCardHtml(state.eventoAtivoId);
  $('confirm-evento-card').innerHTML = eventoCardHtml(eventoDaConfirmacao());
  renderListaEsperada();
}

/* ---- Seletor de eventos (modal) ---- */

// alvo: 'scanner' muda o evento ativo; 'confirm' muda só o evento deste registro.
function abrirPicker(alvo) {
  state.pickerAlvo = alvo;
  $('picker-busca').value = '';
  renderPicker();
  $('picker').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const sel = $('picker-list').querySelector('.picker-item.sel');
  if (sel) sel.scrollIntoView({ block: 'center' });
}

function fecharPicker() {
  $('picker').classList.add('hidden');
  document.body.style.overflow = '';
}

function renderPicker() {
  const termo = norm($('picker-busca').value);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const itens = state.eventos.map(parseEvento).filter(p => {
    if (!termo) return true;
    const data = p.data ? `${String(p.data.getDate()).padStart(2, '0')}/${String(p.data.getMonth() + 1).padStart(2, '0')}` : '';
    return norm([p.tipo, p.fundo, p.local, p.forn.join(' '), data].join(' ')).includes(termo);
  });
  const limiteRecentes = new Date(hoje); limiteRecentes.setDate(limiteRecentes.getDate() - DIAS_RECENTES);
  const manuais = itens.filter(p => !p.data).reverse();
  const futuros = itens.filter(p => p.data && p.data >= hoje).sort((a, b) => a.data - b.data);
  // Eventos que já passaram mas ainda podem ter material voltando (últimos 7 dias).
  const recentes = itens.filter(p => p.data && p.data < hoje && p.data >= limiteRecentes).sort((a, b) => b.data - a.data);
  // Mais antigos: só aparecem quando você pesquisa.
  const antigos = termo ? itens.filter(p => p.data && p.data < limiteRecentes).sort((a, b) => b.data - a.data) : [];

  const marcado = state.pickerAlvo === 'confirm' ? eventoDaConfirmacao() : state.eventoAtivoId;
  const card = (p) => `
    <button type="button" class="picker-item ${p.ev.id === marcado ? 'sel' : ''}" data-id="${escapeHtml(p.ev.id)}">
      ${dateBlockHtml(p)}
      <div class="ev-main">
        <div class="ev-tipo">${escapeHtml(p.tipo)}</div>
        ${p.fundo ? `<div class="ev-fundo">${escapeHtml(p.fundo)}</div>` : ''}
        ${p.local ? `<div class="ev-local">📍 ${escapeHtml(p.local)}</div>` : ''}
        ${p.forn.length ? `<div class="chips">${fornChips(p)}</div>` : ''}
      </div>
    </button>`;

  let html = '';
  if (recentes.length) html += `<div class="picker-mes">Já aconteceram (últimos ${DIAS_RECENTES} dias) · material pode estar voltando</div>${recentes.map(card).join('')}`;
  if (manuais.length) html += `<div class="picker-mes">Criados manualmente</div>${manuais.map(card).join('')}`;
  let mesAtual = '';
  futuros.forEach(p => {
    const mes = p.data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    if (mes !== mesAtual) {
      mesAtual = mes;
      html += `<div class="picker-mes">${escapeHtml(mes.charAt(0).toUpperCase() + mes.slice(1))}</div>`;
    }
    html += card(p);
  });
  if (antigos.length) html += `<div class="picker-mes">Mais antigos</div>${antigos.map(card).join('')}`;
  $('picker-list').innerHTML = html || '<div class="vazio">Nenhum evento encontrado.</div>';
}

$('picker-busca').addEventListener('input', renderPicker);
$('picker').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) return fecharPicker();
  const item = e.target.closest('.picker-item');
  if (!item) return;
  if (state.pickerAlvo === 'confirm') {
    state.eventoConfirmId = item.dataset.id;
  } else if (state.eventoAtivoId !== item.dataset.id) {
    state.eventoAtivoId = item.dataset.id;
    state.scannedCodesThisSession.clear();
  }
  renderEventoCards();
  fecharPicker();
});
$('evento-card').addEventListener('click', () => abrirPicker('scanner'));
$('confirm-evento-card').addEventListener('click', () => abrirPicker('confirm'));

/* ================= PRODUTOS ================= */

const formProduto = $('form-produto');
const pCategoria = $('p-categoria');

pCategoria.addEventListener('change', updateContemVisibility);
function updateContemVisibility() {
  $('p-contem-field').classList.toggle('hidden', pCategoria.value === 'Avulso');
}
updateContemVisibility();

function resetFormProduto() {
  formProduto.reset();
  $('produto-editando').value = '';
  $('btn-cancelar-produto').classList.add('hidden');
  $('produto-form-titulo').textContent = 'Novo produto';
  $('produto-form-box').open = false;
  updateContemVisibility();
}

formProduto.addEventListener('submit', async (e) => {
  e.preventDefault();
  const produto = {
    codigo: $('p-codigo').value.trim(),
    nome: $('p-nome').value.trim(),
    categoria: pCategoria.value,
    contem: $('p-contem').value.split(',').map(s => s.trim()).filter(Boolean),
    quantidade: $('p-quantidade').value.trim(),
    retornoObrigatorio: $('p-retorno').value
  };
  try {
    await Api.salvarProduto(produto);
    toast('Produto salvo.');
    resetFormProduto();
    await loadAll();
  } catch (err) {
    toast('Erro ao salvar produto: ' + err.message, true);
  }
});

$('btn-cancelar-produto').addEventListener('click', resetFormProduto);
$('produtos-busca').addEventListener('input', renderProdutos);

function retornoChip(valor) {
  const v = String(valor).toLowerCase();
  if (v === 'sim') return '<span class="chip chip-red">Retorno obrigatório</span>';
  if (v === 'parcial') return '<span class="chip chip-orange">Retorno parcial</span>';
  return '<span class="chip chip-green">Consumível</span>';
}

function renderProdutos() {
  const termo = norm($('produtos-busca').value);
  const lista = state.produtos.filter(p => !termo || norm(`${p.nome} ${p.codigo} ${p.categoria}`).includes(termo));
  $('produtos-count').textContent = `${state.produtos.length} ${state.produtos.length === 1 ? 'item' : 'itens'}`;
  const ul = $('produtos-lista');
  if (!lista.length) {
    ul.innerHTML = `<li class="vazio">${state.produtos.length ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado ainda.'}</li>`;
    return;
  }
  ul.innerHTML = lista.map(p => `
    <li class="item">
      <div class="item-top">
        <div>
          <div class="item-nome">${escapeHtml(p.nome)}</div>
          <div class="item-sub">Código ${escapeHtml(p.codigo)}${p.quantidade ? ' · Qtd ' + escapeHtml(String(p.quantidade)) : ''}</div>
        </div>
      </div>
      <div class="chips">
        <span class="chip chip-dark">${escapeHtml(p.categoria)}</span>
        ${retornoChip(p.retornoObrigatorio)}
        ${(p.contem || []).length ? `<span class="chip">Contém ${p.contem.length}</span>` : ''}
      </div>
      <div class="item-actions">
        <button class="mini-btn" data-edit="${escapeHtml(p.codigo)}">Editar</button>
        <button class="mini-btn danger" data-del="${escapeHtml(p.codigo)}">Excluir</button>
      </div>
    </li>`).join('');
}

$('produtos-lista').addEventListener('click', (e) => {
  const ed = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-del]');
  if (ed) editarProduto(ed.dataset.edit);
  if (del) excluirProduto(del.dataset.del);
});

function editarProduto(codigo) {
  const p = state.produtos.find(x => x.codigo === codigo);
  if (!p) return;
  $('produto-editando').value = p.codigo;
  $('p-codigo').value = p.codigo;
  $('p-nome').value = p.nome;
  $('p-categoria').value = p.categoria;
  $('p-contem').value = (p.contem || []).join(',');
  $('p-quantidade').value = p.quantidade;
  $('p-retorno').value = p.retornoObrigatorio;
  $('btn-cancelar-produto').classList.remove('hidden');
  $('produto-form-titulo').textContent = 'Editar produto';
  $('produto-form-box').open = true;
  updateContemVisibility();
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
  $('t-item-select').innerHTML = state.produtos.map(p => `<option value="${escapeHtml(p.codigo)}">${escapeHtml(p.nome)} (${escapeHtml(p.codigo)})</option>`).join('');
  $('ev-template').innerHTML = Object.keys(state.templates).map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  // Não apaga o que o usuário está montando se os dados chegarem de novo.
  if (!state.templateItensEmEdicao.length) carregarTemplateParaEdicao();
}

$('t-nome').addEventListener('change', carregarTemplateParaEdicao);
function carregarTemplateParaEdicao() {
  const nome = $('t-nome').value;
  // Troca o conteúdo no mesmo array (o handler de remoção guarda essa referência).
  state.templateItensEmEdicao.splice(0, state.templateItensEmEdicao.length,
    ...(state.templates[nome] || []).map(i => ({ ...i })));
  renderListaEditavel('template-itens-lista', state.templateItensEmEdicao);
}

function renderListaEditavel(ulId, itens) {
  const ul = $(ulId);
  ul.innerHTML = itens.length
    ? itens.map((item, idx) => `<li><span><strong>${escapeHtml(String(item.quantidade))}×</strong> ${escapeHtml(item.nome)}</span><button data-idx="${idx}">remover</button></li>`).join('')
    : '<li class="hint">Nenhum item na lista.</li>';
}

function ligarRemocao(ulId, itens) {
  $(ulId).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-idx]');
    if (!b) return;
    itens.splice(Number(b.dataset.idx), 1);
    renderListaEditavel(ulId, itens);
  });
}
ligarRemocao('template-itens-lista', state.templateItensEmEdicao);
ligarRemocao('evento-itens-lista', state.eventoItensEmEdicao);

$('btn-add-template-item').addEventListener('click', () => {
  const codigo = $('t-item-select').value;
  const produto = state.produtos.find(p => p.codigo === codigo);
  if (!produto) { toast('Cadastre produtos antes de montar o template.', true); return; }
  const qtd = $('t-item-qtd').value.trim() || '1';
  state.templateItensEmEdicao.push({ codigo, nome: produto.nome, quantidade: qtd });
  $('t-item-qtd').value = '';
  renderListaEditavel('template-itens-lista', state.templateItensEmEdicao);
});

$('btn-salvar-template').addEventListener('click', async () => {
  const nome = $('t-nome').value;
  try {
    await Api.salvarTemplate(nome, state.templateItensEmEdicao);
    toast('Template salvo.');
    await loadAll();
  } catch (err) {
    toast('Erro ao salvar template: ' + err.message, true);
  }
});

/* ---- Criar evento manual a partir de template ---- */

$('btn-carregar-template-evento').addEventListener('click', () => {
  const templateNome = $('ev-template').value;
  state.eventoItensEmEdicao.splice(0, state.eventoItensEmEdicao.length,
    ...(state.templates[templateNome] || []).map(i => ({ ...i })));
  renderListaEditavel('evento-itens-lista', state.eventoItensEmEdicao);
  $('btn-salvar-evento').classList.remove('hidden');
});

$('btn-salvar-evento').addEventListener('click', async () => {
  const nome = $('ev-nome').value.trim();
  const templateUsado = $('ev-template').value;
  if (!nome) { toast('Dê um nome ao evento.', true); return; }
  try {
    await Api.criarEvento(nome, templateUsado, state.eventoItensEmEdicao);
    toast('Evento criado.');
    $('ev-nome').value = '';
    state.eventoItensEmEdicao.length = 0;
    renderListaEditavel('evento-itens-lista', state.eventoItensEmEdicao);
    $('btn-salvar-evento').classList.add('hidden');
    await loadAll();
    showScreen('screen-scanner');
  } catch (err) {
    toast('Erro ao criar evento: ' + err.message, true);
  }
});

/* ================= SCANNER ================= */

function renderListaEsperada() {
  const box = $('lista-esperada');
  const ul = $('expected-items');
  const evento = state.eventos.find(ev => ev.id === state.eventoAtivoId);
  if (!evento || !evento.itens || !evento.itens.length) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  const lidos = evento.itens.filter(i => state.scannedCodesThisSession.has(i.codigo)).length;
  $('expected-progress').textContent = `${lidos}/${evento.itens.length} conferidos`;
  ul.innerHTML = evento.itens.map(item => {
    const lido = state.scannedCodesThisSession.has(item.codigo);
    return `<li class="${lido ? 'scanned' : ''}"><span class="check">✓</span>` +
      `<span class="nome">${escapeHtml(item.nome)}</span><span class="chip">${escapeHtml(String(item.quantidade))}×</span></li>`;
  }).join('');
}

const btnToggleScan = $('btn-toggle-scan');
btnToggleScan.addEventListener('click', () => {
  if (state.scanning) stopScanner(); else startScanner();
});

function setCameraUi(ligada) {
  state.scanning = ligada;
  btnToggleScan.textContent = ligada ? 'Desligar câmera' : 'Ligar câmera';
  $('camera-box').classList.toggle('on', ligada);
}

function startScanner() {
  if (!state.eventoAtivoId) {
    toast('Escolha um evento antes de bipar.', true);
    return;
  }
  const F = Html5QrcodeSupportedFormats;
  state.html5QrCode = state.html5QrCode || new Html5Qrcode('reader', {
    formatsToSupport: [F.QR_CODE, F.CODE_128, F.CODE_39, F.EAN_13, F.EAN_8, F.UPC_A],
    useBarCodeDetectorIfSupported: true
  });
  // Área de leitura retangular e larga: serve para QR e para códigos de barras 1D.
  const config = {
    fps: 10,
    qrbox: (w, h) => ({ width: Math.floor(Math.min(w, h * 1.6) * 0.9), height: Math.floor(Math.min(w, h * 1.6) * 0.5) })
  };
  state.html5QrCode.start(
    { facingMode: 'environment' },
    config,
    onScanSuccess,
    () => {} // frame sem código, ignorar
  ).then(() => setCameraUi(true)).catch(err => {
    toast('Não foi possível abrir a câmera: ' + err, true);
  });
}

function stopScanner() {
  if (state.html5QrCode && state.scanning) {
    state.html5QrCode.stop().then(() => setCameraUi(false)).catch(() => {});
  } else {
    setCameraUi(false);
  }
}

function onScanSuccess(decodedText) {
  if (state.pendingScan) return;
  const codigo = decodedText.trim();
  const agora = Date.now();
  // Evita ler de novo o mesmo código que ainda está na frente da câmera.
  if (codigo === state.ultimoCodigo && agora < state.ignorarAte) return;
  const produto = state.produtos.find(p => p.codigo === codigo);
  if (!produto) {
    state.ultimoCodigo = codigo;
    state.ignorarAte = agora + 3000;
    toast(`Código não reconhecido: ${codigo}`, true);
    return;
  }
  // Pausa (sem desligar a câmera) enquanto a confirmação está aberta.
  try { state.html5QrCode.pause(true); } catch (e) {}
  abrirConfirmacao(produto);
}

// Volta ao scanner com a câmera já ligada, pronta para o próximo item.
function voltarAoScanner() {
  state.pendingScan = null;
  state.eventoConfirmId = null;
  state.ignorarAte = Date.now() + 2000;
  showScreen('screen-scanner');
  if (state.scanning) {
    try { state.html5QrCode.resume(); } catch (e) { startScanner(); }
  } else {
    startScanner();
  }
}

/* ================= CONFIRMAÇÃO ================= */

function abrirConfirmacao(produto) {
  state.pendingScan = produto;
  $('confirm-nome').textContent = produto.nome;
  $('confirm-chips').innerHTML =
    `<span class="chip">Código ${escapeHtml(produto.codigo)}</span>` +
    `<span class="chip chip-dark">${escapeHtml(produto.categoria)}</span>` +
    (produto.quantidade ? `<span class="chip">Qtd ${escapeHtml(String(produto.quantidade))}</span>` : '');
  const flag = $('confirm-retorno-flag');
  const v = String(produto.retornoObrigatorio).toLowerCase();
  if (v === 'sim') {
    flag.textContent = 'Retorno obrigatório';
    flag.className = 'badge';
  } else if (v === 'parcial') {
    flag.textContent = 'Retorno parcial';
    flag.className = 'badge opcional';
  } else {
    flag.textContent = 'Retorno não obrigatório (consumível)';
    flag.className = 'badge opcional';
  }
  mostrarOpcoesDeTipo(produto);
  showScreen('screen-confirmacao');
}

// Último registro do item no histórico (o status atual é sempre calculado daqui).
function ultimoRegistro(codigo) {
  let ultimo = null;
  state.historico.forEach(h => {
    if (h.codigoItem !== codigo) return;
    if (!ultimo || new Date(h.timestamp) >= new Date(ultimo.timestamp)) ultimo = h;
  });
  return ultimo;
}

// Item que saiu só pode voltar; item que voltou (ou nunca saiu) só pode sair.
function mostrarOpcoesDeTipo(produto) {
  const ult = ultimoRegistro(produto.codigo);
  const fora = !!ult && ult.tipo === 'saida';
  const estado = $('confirm-estado');
  if (fora) {
    estado.className = 'estado fora';
    estado.innerHTML = `Este item está <strong>FORA</strong> desde ${formatDate(ult.timestamp)}` +
      `<small>${escapeHtml(nomeCurto(ult.evento))}</small>`;
  } else if (ult) {
    estado.className = 'estado dentro';
    estado.innerHTML = `Item de volta desde ${formatDate(ult.timestamp)}`;
  } else {
    estado.className = 'estado novo';
    estado.textContent = 'Primeira movimentação deste item';
  }
  // Retorno é registrado no evento de onde o item saiu (se ele ainda estiver na lista).
  const eventoDeOrigem = fora ? state.eventos.find(e => e.nome === ult.evento) : null;
  state.eventoConfirmId = eventoDeOrigem ? eventoDeOrigem.id : null;
  renderEventoCards();
  const permitido = fora ? 'retorno' : 'saida';
  const outro = fora ? 'saida' : 'retorno';
  $('btn-saida').classList.toggle('hidden', permitido !== 'saida');
  $('btn-retorno').classList.toggle('hidden', permitido !== 'retorno');
  document.querySelector('.confirm-actions').classList.add('um');
  const link = $('btn-outro-tipo');
  link.classList.remove('hidden');
  link.textContent = fora ? 'Esqueci o retorno antes: registrar SAÍDA mesmo assim'
                          : 'Esqueci a saída antes: registrar RETORNO mesmo assim';
  link.dataset.outro = outro;
}

$('btn-outro-tipo').addEventListener('click', (e) => {
  // Saída de emergência: libera o botão do outro tipo (ex.: retorno que ninguém bipou).
  $('btn-' + e.currentTarget.dataset.outro).classList.remove('hidden');
  document.querySelector('.confirm-actions').classList.remove('um');
  e.currentTarget.classList.add('hidden');
});

$('btn-cancelar-confirm').addEventListener('click', voltarAoScanner);
$('btn-saida').addEventListener('click', () => confirmarBipagem('saida'));
$('btn-retorno').addEventListener('click', () => confirmarBipagem('retorno'));

async function confirmarBipagem(tipo) {
  const produto = state.pendingScan;
  if (!produto) return;
  const evento = state.eventos.find(ev => ev.id === eventoDaConfirmacao());
  const rotulo = tipo === 'saida' ? 'Saída' : 'Retorno';

  // Volta a bipar na hora; o envio ao Sheets segue em segundo plano.
  state.ultimoCodigo = produto.codigo;
  state.scannedCodesThisSession.add(produto.codigo);
  // Registro provisório: o próximo bip do mesmo item já enxerga o novo estado.
  const provisorio = { timestamp: new Date().toISOString(), codigoItem: produto.codigo, nomeItem: produto.nome, tipo, evento: evento ? evento.nome : '' };
  state.historico.push(provisorio);
  renderListaEsperada();
  voltarAoScanner();
  toast(`Registrando ${rotulo.toLowerCase()}: ${produto.nome}…`);

  try {
    await Api.bipar(produto.codigo, tipo, evento ? evento.nome : '');
    toast(`✓ ${rotulo} registrada: ${produto.nome}`);
    const [historico, status] = await Promise.all([Api.getHistorico(), Api.getStatus()]);
    state.historico = historico;
    state.status = status;
    renderHistoricoEStatus();
  } catch (err) {
    state.historico = state.historico.filter(h => h !== provisorio);
    state.scannedCodesThisSession.delete(produto.codigo);
    renderListaEsperada();
    toast(`ERRO: ${rotulo} de "${produto.nome}" NÃO foi registrada. Bipe de novo. (${err.message})`, true);
  }
}

/* ================= STATUS / HISTÓRICO ================= */

function renderHistoricoEStatus() {
  const alertas = state.status.filter(s => s.alerta);
  const esperados = state.status.filter(s => !s.alerta);
  $('count-alertas').textContent = alertas.length;
  $('count-esperados').textContent = esperados.length;

  const itemStatus = (a, classe) => `
    <li class="item ${classe}">
      <div class="item-nome">${escapeHtml(a.nome)}</div>
      <div class="item-sub">Saiu em ${formatDate(a.desde)}</div>
      <div class="item-sub">${escapeHtml(nomeCurto(a.evento))}</div>
    </li>`;

  $('lista-alertas').innerHTML = alertas.length
    ? alertas.map(a => itemStatus(a, 'alerta')).join('')
    : '<li class="vazio">Nenhum item pendente. 🎉</li>';
  $('lista-esperados').innerHTML = esperados.length
    ? esperados.map(a => itemStatus(a, '')).join('')
    : '<li class="vazio">Nenhum.</li>';

  const rows = state.historico.slice().reverse().slice(0, 100);
  $('historico-lista').innerHTML = rows.length
    ? rows.map(h => `
      <li class="item">
        <div class="item-top">
          <div class="item-nome">${escapeHtml(h.nomeItem)}</div>
          <span class="chip ${h.tipo === 'saida' ? 'chip-orange' : 'chip-green'}">${h.tipo === 'saida' ? 'Saída' : 'Retorno'}</span>
        </div>
        <div class="item-sub">${formatDate(h.timestamp)}</div>
        <div class="item-sub">${escapeHtml(nomeCurto(h.evento))}</div>
      </li>`).join('')
    : '<li class="vazio">Nenhuma bipagem registrada ainda.</li>';
}

/* ================= Utils ================= */

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// minúsculas e sem acento, para busca.
function norm(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function formatDate(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

renderListaEditavel('template-itens-lista', state.templateItensEmEdicao);
renderListaEditavel('evento-itens-lista', state.eventoItensEmEdicao);
const cacheInicial = lerCache();
if (cacheInicial) aplicarDados(cacheInicial);
else renderEventoCards();
loadAll();
