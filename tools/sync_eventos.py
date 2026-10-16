"""Importa eventos da planilha de datas (Dropbox) para o app de controle de materiais.

Regras:
- Aba "Contatos", cabeçalho na linha 5, dados a partir da linha 6.
- Só entram linhas cuja coluna Fornecedor é VIVA ou Luminous (Triunfo, Particular e demais ficam de fora).
- Só eventos com Data Reservada >= hoje.
- Linhas com mesma data + fundo + local + tipo (VIVA e Luminous no mesmo evento) viram UM evento.
- Eventos já importados antes não são duplicados.

Uso:
    python sync_eventos.py            # envia ao app
    python sync_eventos.py --dry-run  # só mostra o que seria enviado
"""
import datetime
import hashlib
import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

import openpyxl

XLSX = Path(r"C:\Users\pedro\Dropbox\VIVA_Rede Planejamento\2. CP Cotação\3. Data Eventos_VIVA GV.xlsx")
CONFIG_JS = Path(__file__).resolve().parent.parent / "js" / "config.js"
ABA = "Contatos"
PRIMEIRA_LINHA = 6
# Colunas (0 = A). A planilha começa na coluna B.
COL_CIDADE, COL_FORNECEDOR, COL_FUNDO, COL_DATA, COL_LOCAL, COL_EVENTO = 2, 3, 4, 5, 7, 9
FORNECEDORES_OK = {"viva", "luminous"}


def norm(texto):
    """minúsculas, sem acento, espaços colapsados."""
    t = unicodedata.normalize("NFKD", str(texto or ""))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t).strip().lower()


def limpo(texto):
    return re.sub(r"\s+", " ", str(texto or "")).strip()


def template_do_tipo(tipo):
    t = norm(tipo)
    if "sessao" in t:
        return "Sessão de Fotos"
    if "colacao" in t:
        return "Colação de Grau"
    if "jaleco" in t:
        return "Cerimônia do Jaleco"
    if "baile" in t:
        return "Baile"
    if "missa" in t:
        return "Missa"
    if "pre-evento" in t or "pre evento" in t:
        return "Pré-evento"
    return ""


def api_url():
    m = re.search(r"API_URL:\s*'([^']+)'", CONFIG_JS.read_text(encoding="utf-8"))
    if not m:
        sys.exit("API_URL não encontrada em js/config.js")
    return m.group(1)


def ler_eventos():
    wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
    hoje = datetime.datetime.combine(datetime.date.today(), datetime.time())
    grupos = {}
    for r in wb[ABA].iter_rows(min_row=PRIMEIRA_LINHA, values_only=True):
        r = list(r) + [None] * 12
        data = r[COL_DATA]
        if not isinstance(data, datetime.datetime) or data < hoje:
            continue
        fornecedor = norm(r[COL_FORNECEDOR])
        if fornecedor not in FORNECEDORES_OK:
            continue
        fundo = limpo(str(r[COL_FUNDO] or "").split("\n")[0])
        local = limpo(r[COL_LOCAL])
        tipo = limpo(r[COL_EVENTO]).rstrip(":") or "Evento"
        chave = f"{data.date()}|{norm(fundo)}|{norm(local)}|{norm(tipo)}"
        g = grupos.setdefault(chave, {"data": data, "fundo": fundo, "local": local,
                                       "tipo": tipo, "cidade": limpo(r[COL_CIDADE]), "forn": set()})
        g["forn"].add("VIVA" if fornecedor == "viva" else "Luminous")

    eventos = []
    for chave, g in sorted(grupos.items()):
        forn = " + ".join(sorted(g["forn"]))
        nome = f"{g['data']:%d/%m/%Y} - {g['fundo']} - {g['tipo']}"
        if g["local"]:
            nome += f" ({g['local']})"
        nome += f" [{forn}]"
        eventos.append({
            "id": "imp-" + hashlib.sha1(chave.encode("utf-8")).hexdigest()[:16],
            "nome": nome,
            "templateUsado": template_do_tipo(g["tipo"]),
        })
    return eventos


def enviar(eventos):
    corpo = json.dumps({"action": "importarEventos", "eventos": eventos}).encode("utf-8")
    req = urllib.request.Request(api_url(), data=corpo, method="POST",
                                 headers={"Content-Type": "text/plain;charset=utf-8"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        resultado = json.loads(resp.read().decode("utf-8"))
    if not resultado.get("ok"):
        sys.exit("Erro do app: " + str(resultado.get("error")))
    return resultado["data"]


def main():
    dry = "--dry-run" in sys.argv
    eventos = ler_eventos()
    print(f"{len(eventos)} eventos (VIVA/Luminous, de hoje em diante).")
    if dry:
        for e in eventos:
            print(f"  [{e['templateUsado'] or 'sem template':<20}] {e['nome']}")
        return
    r = enviar(eventos)
    print(f"Novos: {r['criados']} | Já existiam: {r['ignorados']}")


if __name__ == "__main__":
    main()
