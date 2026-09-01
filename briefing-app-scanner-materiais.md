# Briefing: App de Controle de Materiais (Saída/Retorno via QR Code)

## Contexto
App web simples para controlar materiais do escritório que saem para eventos e precisam voltar. Hoje itens estão sumindo por falta de controle. A ideia é etiquetar cada item com QR code e bipar na saída e no retorno.

## Objetivo
Um app que funciona direto no navegador do celular (sem instalar nada), que:
1. Abre a câmera e lê QR codes
2. Ao ler, mostra o nome do item e pede para escolher: **SAÍDA** ou **RETORNO**, além do evento vinculado
3. Grava esse registro (item + tipo + evento + data/hora)
4. Mostra uma lista do que está "fora" no momento (itens cujo último registro foi saída sem retorno depois)

## Cadastro de Produtos
Cada produto/item cadastrado tem:
- **Nome**
- **Categoria**: Caixote / Caixa / Bag (container) ou Item avulso
- Se for **container**: lista de quais itens ele carrega por padrão
- **Quantidade** (ex: "Copos descartáveis — 100un por caixa")
- **Retorno obrigatório**: Sim / Não / Parcial (ex: copos e bebidas = não obrigatório, pois se consomem no evento)

## Templates de Evento (kits pré-programados)
- Um modelo por tipo de evento (Pré-evento, Colação de Grau, Missa, Baile, Cerimônia do Jaleco, Sessão de Fotos)
- Cada template = lista padrão de itens/containers com quantidade (ex: Pré-evento → 200 copos, kit vassoura/rodo/pá, 3 gin, 5 vodka, 4 parleds, caixote de ferramentas, caixote de rádios, caixote de extensões)
- Ao criar um evento novo: escolhe o template → puxa a lista pronta → edita ali mesmo (adiciona, remove, ajusta quantidade) antes de bipar a saída

## Telas
1. **Cadastro de Produtos** — CRUD: nome, categoria, é container (e o que contém), quantidade, retorno obrigatório
2. **Cadastro de Templates de Evento** — monta/edita a lista padrão por tipo de evento
3. **Scanner** — tela principal, câmera ativa, lê QR automaticamente; se o evento tem template, mostra a lista esperada ao lado para conferência
4. **Confirmação** — após ler: nome do item, botões grandes SAÍDA/RETORNO, seletor de evento; itens com retorno não obrigatório ficam sinalizados diferente
5. **Histórico/Status** — separa "fora, retorno obrigatório, ainda não voltou" (alerta real de possível sumiço) de "fora, retorno não obrigatório" (esperado, não é alerta)

## Lógica de dados
- Cada bipagem = 1 registro: `código_item`, `tipo` (saida/retorno), `evento`, `timestamp`
- Status atual do item = tipo do registro mais recente dele
- Não precisa de campo de "status" separado — é sempre calculado a partir do histórico
- Cadastro de produtos e templates ficam em abas/tabelas separadas do histórico de bipagem

## Armazenamento
Gravar direto no Google Sheets via API (conta de serviço, sem exigir login do usuário toda vez). Se no uso real der problema de sinal em evento, migrar depois para guardar localmente no celular e sincronizar quando tiver internet — mas começar simples, direto no Sheets.

## Tecnologia sugerida
- HTML/JS puro (ou framework leve), sem necessidade de build complexo
- Biblioteca de leitura de QR: `html5-qrcode`
- Hospedagem estática: GitHub Pages ou Vercel
- Funciona como "app" ao abrir o link no navegador do celular — sem loja de apps

## Cadastro dos itens
Os QR codes dos itens são gerados numa planilha (fórmula de imagem do Google Sheets), cada linha = 1 item com seu código único. Isso já existe/será feito à parte — o app só precisa ler o código e reconhecer no banco de itens.

## Primeira entrega (MVP)
Sugestão de ordem de construção:
1. Cadastro de Produtos (mesmo que simples, via formulário/planilha)
2. Cadastro de Templates de Evento
3. Fluxo de bipagem: abrir câmera → ler QR → mostrar nome do item → escolher saída/retorno + evento → salvar no Sheets
4. Tela de histórico/status separando alertas reais (retorno obrigatório pendente) de itens esperados fora (retorno não obrigatório)

Pode simplificar o visual no início — o importante é o fluxo funcionar bem no celular, com boa leitura de câmera mesmo em ambientes com luz variada (eventos à noite, salões, etc).
