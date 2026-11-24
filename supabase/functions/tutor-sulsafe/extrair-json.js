// ============================================================
// TUTOR-SULSAFE — EXTRAÇÃO DE JSON DE RESPOSTAS DE MODELO
// ============================================================
// Módulo único (Deno + Node) usado pela Edge Function e pelos testes.
//
// Modelos costumam responder com texto explicativo antes/depois do JSON e,
// às vezes, com um bloco markdown ```json ... ```. Remover crases só no
// início/fim (^ e $) quebra nesses casos. Aqui tentamos, nesta ordem:
//   1. cada bloco markdown cercado por ``` (com ou sem o rótulo json);
//   2. o trecho entre o primeiro '{' e o último '}'.
// Qualquer candidato é submetido a JSON.parse: texto em volta nunca é
// aceito. Se nenhum candidato parseia, a função LANÇA ERRO — ela nunca
// devolve um objeto vazio que pudesse ser gravado como rascunho.

const MENSAGEM_ERRO = 'O provedor não retornou um JSON válido'

/** Blocos markdown ```json ... ``` ou ``` ... ``` em qualquer posição do texto. */
function blocosMarkdown(texto) {
    const encontrados = []
    const padrao = /```[ \t]*(json)?[ \t]*\r?\n?([\s\S]*?)```/gi

    for (const correspondencia of texto.matchAll(padrao)) {
        const bloco = (correspondencia[2] || '').trim()
        if (bloco) encontrados.push(bloco)
    }

    return encontrados
}

/** Define os trechos candidatos, sem duplicatas. */
function candidatosDe(texto) {
    const candidatos = []

    for (const bloco of blocosMarkdown(texto)) {
        candidatos.push(bloco)
    }

    const inicioObjeto = texto.indexOf('{')
    const fimObjeto = texto.lastIndexOf('}')
    if (inicioObjeto >= 0 && fimObjeto > inicioObjeto) {
        candidatos.push(texto.slice(inicioObjeto, fimObjeto + 1))
    }

    return candidatos.filter((candidato, indice, todos) => todos.indexOf(candidato) === indice)
}

/**
 * Extrai o JSON de uma resposta de modelo.
 * @param {string} texto
 * @returns {any}
 * @throws {Error} se não houver JSON válido — chamador deve marcar o job como ERRO.
 */
export function extrairJson(texto) {
    if (typeof texto !== 'string' || !texto.trim()) {
        throw new Error(MENSAGEM_ERRO)
    }

    const limpo = texto.trim()

    for (const candidato of candidatosDe(limpo)) {
        try {
            return JSON.parse(candidato)
        } catch {
            // tenta o próximo candidato; nunca engole todos os erros em silêncio
        }
    }

    throw new Error(MENSAGEM_ERRO)
}
