/**
 * API do App de Controle de Materiais (Scanner QR).
 * Publicar como Web App: Implantar > Nova implantação > Tipo "App da Web"
 *   - Executar como: Eu (dono da planilha)
 *   - Quem pode acessar: Qualquer pessoa
 * Copiar a URL gerada e colar em js/config.js (API_URL).
 *
 * Rodar setup() uma vez pelo editor antes de usar, para criar as abas.
 */

var SHEET_PRODUTOS = 'Produtos';
var SHEET_TEMPLATES = 'Templates';
var SHEET_EVENTOS = 'Eventos';
var SHEET_HISTORICO = 'Historico';

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEET_PRODUTOS, ['Codigo', 'Nome', 'Categoria', 'Contem', 'Quantidade', 'RetornoObrigatorio']);
  ensureSheet_(ss, SHEET_TEMPLATES, ['TemplateNome', 'ItemCodigo', 'ItemNome', 'Quantidade']);
  ensureSheet_(ss, SHEET_EVENTOS, ['EventoId', 'Nome', 'TemplateUsado', 'DataCriacao', 'ItensJSON']);
  ensureSheet_(ss, SHEET_HISTORICO, ['Timestamp', 'CodigoItem', 'NomeItem', 'Tipo', 'Evento']);
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
}

function doGet(e) {
  var action = e.parameter.action;
  try {
    switch (action) {
      case 'produtos':
        return respond_({ ok: true, data: getProdutos_() });
      case 'templates':
        return respond_({ ok: true, data: getTemplatesGrouped_() });
      case 'eventos':
        return respond_({ ok: true, data: getEventos_() });
      case 'historico':
        return respond_({ ok: true, data: getHistorico_() });
      case 'status':
        return respond_({ ok: true, data: getStatus_() });
      case 'tudo':
        return respond_({ ok: true, data: getTudo_() });
      default:
        return respond_({ ok: false, error: 'Ação inválida: ' + action });
    }
  } catch (err) {
    return respond_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var result;
    switch (action) {
      case 'salvarProduto':
        result = salvarProduto_(body.produto);
        break;
      case 'excluirProduto':
        result = excluirProduto_(body.codigo);
        break;
      case 'salvarTemplate':
        result = salvarTemplate_(body.templateNome, body.itens);
        break;
      case 'excluirTemplate':
        result = excluirTemplate_(body.templateNome);
        break;
      case 'criarEvento':
        result = criarEvento_(body.nome, body.templateUsado, body.itens);
        break;
      case 'atualizarEvento':
        result = atualizarEvento_(body.eventoId, body.itens);
        break;
      case 'importarEventos':
        result = importarEventos_(body.eventos);
        break;
      case 'bipar':
        result = registrarBipagem_(body.codigo, body.tipo, body.evento);
        break;
      default:
        return respond_({ ok: false, error: 'Ação inválida: ' + action });
    }
    return respond_({ ok: true, data: result });
  } catch (err) {
    return respond_({ ok: false, error: String(err) });
  }
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- Produtos ---------------- */

function getProdutos_() {
  var sheet = getSheet_(SHEET_PRODUTOS);
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    out.push({
      codigo: String(r[0]),
      nome: r[1],
      categoria: r[2],
      contem: r[3] ? String(r[3]).split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [],
      quantidade: r[4],
      retornoObrigatorio: r[5]
    });
  }
  return out;
}

function salvarProduto_(p) {
  if (!p || !p.codigo) throw new Error('Produto sem código');
  var sheet = getSheet_(SHEET_PRODUTOS);
  var rows = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(p.codigo)) { rowIndex = i + 1; break; }
  }
  var contem = Array.isArray(p.contem) ? p.contem.join(',') : (p.contem || '');
  var values = [p.codigo, p.nome, p.categoria, contem, p.quantidade, p.retornoObrigatorio];
  if (rowIndex === -1) {
    sheet.appendRow(values);
  } else {
    sheet.getRange(rowIndex, 1, 1, values.length).setValues([values]);
  }
  return { codigo: p.codigo };
}

function excluirProduto_(codigo) {
  var sheet = getSheet_(SHEET_PRODUTOS);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(codigo)) {
      sheet.deleteRow(i + 1);
      return { removido: codigo };
    }
  }
  throw new Error('Produto não encontrado: ' + codigo);
}

/* ---------------- Templates ---------------- */

function getTemplatesGrouped_() {
  var sheet = getSheet_(SHEET_TEMPLATES);
  var rows = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    var nome = r[0];
    if (!map[nome]) map[nome] = [];
    map[nome].push({ codigo: String(r[1]), nome: r[2], quantidade: r[3] });
  }
  return map;
}

function salvarTemplate_(templateNome, itens) {
  if (!templateNome) throw new Error('Template sem nome');
  var sheet = getSheet_(SHEET_TEMPLATES);
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === templateNome) sheet.deleteRow(i + 1);
  }
  itens.forEach(function (it) {
    sheet.appendRow([templateNome, it.codigo, it.nome, it.quantidade]);
  });
  return { template: templateNome, itens: itens.length };
}

function excluirTemplate_(templateNome) {
  var sheet = getSheet_(SHEET_TEMPLATES);
  var rows = sheet.getDataRange().getValues();
  var removed = 0;
  for (var i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === templateNome) { sheet.deleteRow(i + 1); removed++; }
  }
  if (!removed) throw new Error('Template não encontrado: ' + templateNome);
  return { removido: templateNome };
}

/* ---------------- Eventos ---------------- */

function getEventos_() {
  var sheet = getSheet_(SHEET_EVENTOS);
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    out.push({
      id: String(r[0]),
      nome: r[1],
      templateUsado: r[2],
      dataCriacao: r[3],
      itens: r[4] ? JSON.parse(r[4]) : []
    });
  }
  return out;
}

function criarEvento_(nome, templateUsado, itens) {
  if (!nome) throw new Error('Evento sem nome');
  var sheet = getSheet_(SHEET_EVENTOS);
  var id = Utilities.getUuid();
  sheet.appendRow([id, nome, templateUsado || '', new Date(), JSON.stringify(itens || [])]);
  return { id: id, nome: nome };
}

// Importa eventos vindos do script local (planilha de datas). Cada evento tem um id
// determinístico: se já existe na aba Eventos, é ignorado (preserva edições de itens).
// Se o evento traz um template conhecido, a lista de itens é copiada dele.
function importarEventos_(eventos) {
  var sheet = getSheet_(SHEET_EVENTOS);
  var existentes = {};
  getEventos_().forEach(function (ev) { existentes[ev.id] = true; });
  var templates = getTemplatesGrouped_();
  var criados = 0, ignorados = 0;
  (eventos || []).forEach(function (ev) {
    if (!ev.id || !ev.nome) return;
    if (existentes[ev.id]) { ignorados++; return; }
    var itens = (ev.templateUsado && templates[ev.templateUsado]) ? templates[ev.templateUsado] : [];
    sheet.appendRow([ev.id, ev.nome, ev.templateUsado || '', new Date(), JSON.stringify(itens)]);
    existentes[ev.id] = true;
    criados++;
  });
  return { criados: criados, ignorados: ignorados };
}

function atualizarEvento_(eventoId, itens) {
  var sheet = getSheet_(SHEET_EVENTOS);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(eventoId)) {
      sheet.getRange(i + 1, 5).setValue(JSON.stringify(itens || []));
      return { id: eventoId, itens: itens.length };
    }
  }
  throw new Error('Evento não encontrado: ' + eventoId);
}

/* ---------------- Histórico / Bipagem ---------------- */

function getHistorico_() {
  var sheet = getSheet_(SHEET_HISTORICO);
  var rows = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[1]) continue;
    out.push({
      timestamp: r[0],
      codigoItem: String(r[1]),
      nomeItem: r[2],
      tipo: r[3],
      evento: r[4]
    });
  }
  return out;
}

function registrarBipagem_(codigo, tipo, evento) {
  if (!codigo || !tipo) throw new Error('Bipagem inválida');
  var produtos = getProdutos_();
  var produto = produtos.filter(function (p) { return p.codigo === String(codigo); })[0];
  if (!produto) throw new Error('Item não cadastrado: ' + codigo);
  var sheet = getSheet_(SHEET_HISTORICO);
  var timestamp = new Date();
  sheet.appendRow([timestamp, produto.codigo, produto.nome, tipo, evento || '']);
  return { codigo: produto.codigo, nome: produto.nome, tipo: tipo, evento: evento, timestamp: timestamp };
}

/* ---------------- Status calculado ---------------- */

// Tudo numa chamada só (o app abre bem mais rápido do que com 5 requisições).
function getTudo_() {
  var produtos = getProdutos_();
  var historico = getHistorico_();
  return {
    produtos: produtos,
    templates: getTemplatesGrouped_(),
    eventos: getEventos_(),
    historico: historico,
    status: calcStatus_(produtos, historico)
  };
}

function getStatus_() {
  return calcStatus_(getProdutos_(), getHistorico_());
}

function calcStatus_(produtos, historico) {
  var ultimo = {};
  historico.forEach(function (h) {
    var atual = ultimo[h.codigoItem];
    if (!atual || new Date(h.timestamp) > new Date(atual.timestamp)) {
      ultimo[h.codigoItem] = h;
    }
  });
  var fora = [];
  produtos.forEach(function (p) {
    var reg = ultimo[p.codigo];
    if (reg && reg.tipo === 'saida') {
      fora.push({
        codigo: p.codigo,
        nome: p.nome,
        retornoObrigatorio: p.retornoObrigatorio,
        evento: reg.evento,
        desde: reg.timestamp,
        alerta: String(p.retornoObrigatorio).toLowerCase() === 'sim'
      });
    }
  });
  return fora;
}

function getSheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Aba não encontrada: ' + name + '. Rode setup() primeiro.');
  return sheet;
}
