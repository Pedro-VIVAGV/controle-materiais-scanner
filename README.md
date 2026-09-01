# Controle de Materiais — Scanner QR

App web (sem instalação) para bipar saída/retorno de materiais de evento via QR code.
Front-end estático + Google Sheets como banco de dados, acessado via Google Apps Script (sem expor credenciais no celular).

## 1. Criar a planilha e o backend (Apps Script)

1. Crie uma planilha nova no Google Sheets (ex: "Controle de Materiais").
2. Menu **Extensões > Apps Script**.
3. Apague o conteúdo do `Code.gs` padrão e cole o conteúdo de [`apps-script/Code.gs`](apps-script/Code.gs) deste projeto.
4. No editor, selecione a função `setup` no seletor de funções (topo) e clique em **Executar** uma vez. Isso cria as abas `Produtos`, `Templates`, `Eventos` e `Historico` com os cabeçalhos certos. Autorize as permissões pedidas (é a sua própria conta acessando a sua própria planilha).
5. Clique em **Implantar > Nova implantação**.
   - Tipo: **App da Web**
   - Executar como: **Eu** (sua conta — assim ninguém precisa logar no celular)
   - Quem pode acessar: **Qualquer pessoa**
6. Copie a URL gerada (algo como `https://script.google.com/macros/s/AKfycb.../exec`).

Sempre que você editar o `Code.gs`, use **Implantar > Gerenciar implantações > Editar (lápis) > Nova versão** para publicar as mudanças (senão a URL antiga continua rodando a versão antiga).

## 2. Configurar o front-end

Abra [`js/config.js`](js/config.js) e cole a URL copiada:

```js
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycb.../exec'
};
```

## 3. Hospedar

Qualquer hospedagem estática funciona (GitHub Pages, Vercel, Netlify). Exemplo com GitHub Pages:

```bash
git init
git add .
git commit -m "App scanner de materiais"
git branch -M main
git remote add origin <URL_DO_SEU_REPO>
git push -u origin main
```

Depois, no repositório no GitHub: **Settings > Pages > Branch: main > Save**. A URL pública fica em `https://<usuario>.github.io/<repo>/`.

Abra essa URL no celular (Chrome/Safari) — funciona como app direto do navegador, sem loja de apps. Peça permissão de câmera quando solicitado.

## 4. Como usar

1. **Produtos**: cadastre cada item com o mesmo código que está no QR code gerado na planilha de etiquetas (essa parte de gerar/imprimir QR já existe à parte, fora do app).
2. **Templates**: monte a lista padrão de cada tipo de evento (Pré-evento, Baile, etc.).
3. Ainda em **Templates**, dê um nome ao evento real, escolha o template base, clique em "Puxar lista do template", ajuste itens se precisar, e salve o evento.
4. **Scanner**: selecione o evento ativo, inicie a câmera e biba os itens. Ao ler um QR, aparece a tela de confirmação com os botões grandes SAÍDA / RETORNO.
5. **Status**: mostra separadamente os itens com retorno obrigatório pendente (alerta real) e os que estão fora mas não precisam voltar (consumíveis).

## Estrutura de dados no Sheets

- **Produtos**: Codigo, Nome, Categoria, Contem, Quantidade, RetornoObrigatorio
- **Templates**: TemplateNome, ItemCodigo, ItemNome, Quantidade (uma linha por item do template)
- **Eventos**: EventoId, Nome, TemplateUsado, DataCriacao, ItensJSON (lista de itens do evento, editável a partir do template)
- **Historico**: Timestamp, CodigoItem, NomeItem, Tipo (saida/retorno), Evento

O status "fora"/"dentro" de cada item é sempre calculado a partir do último registro dele no Histórico — não existe uma coluna de status separada.

## Próximos passos sugeridos (fora do MVP)

- Se o sinal de internet for ruim em eventos, trocar o fetch direto por fila local (localStorage/IndexedDB) com sincronização quando a conexão voltar.
- Autocomplete/busca no seletor de "Contém" e no item do template, em vez de lista solta.
- Exportar histórico/status em PDF para conferência pós-evento.
