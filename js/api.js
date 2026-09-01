// Camada de comunicação com o backend (Google Apps Script Web App).
const Api = (() => {
  function url() {
    const u = window.APP_CONFIG && window.APP_CONFIG.API_URL;
    if (!u || u.indexOf('COLE_AQUI') === 0) {
      throw new Error('Configure a URL do Apps Script em js/config.js');
    }
    return u;
  }

  async function get(action) {
    const res = await fetch(`${url()}?action=${encodeURIComponent(action)}`, { method: 'GET' });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Erro desconhecido');
    return json.data;
  }

  async function post(action, payload) {
    // text/plain evita preflight CORS; o Apps Script lê e faz JSON.parse do corpo.
    const res = await fetch(url(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload })
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Erro desconhecido');
    return json.data;
  }

  return {
    getProdutos: () => get('produtos'),
    getTemplates: () => get('templates'),
    getEventos: () => get('eventos'),
    getHistorico: () => get('historico'),
    getStatus: () => get('status'),

    salvarProduto: (produto) => post('salvarProduto', { produto }),
    excluirProduto: (codigo) => post('excluirProduto', { codigo }),

    salvarTemplate: (templateNome, itens) => post('salvarTemplate', { templateNome, itens }),
    excluirTemplate: (templateNome) => post('excluirTemplate', { templateNome }),

    criarEvento: (nome, templateUsado, itens) => post('criarEvento', { nome, templateUsado, itens }),
    atualizarEvento: (eventoId, itens) => post('atualizarEvento', { eventoId, itens }),

    bipar: (codigo, tipo, evento) => post('bipar', { codigo, tipo, evento })
  };
})();
