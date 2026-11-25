// ============================================================
// TUTOR-SULSAFE — MOTOR DE PROMPT E ADAPTAÇÃO DE SAÍDA
// ============================================================
// IA 2 (Professor I.A). Esta camada é PURA: sem DOM, sem fetch, sem secrets.
// Pode ser importada diretamente nos testes do Node.
//
// Desenho homologado na MR (3C), portado sem copiar infra:
//   pedido do usuário -> prompt_base + instrução JSON nativa
//   -> OpenMAIC (somente ementa, outlineReview='wait')
//   -> formato nativo { courseTitle, outlines[] }
//   -> adaptador -> contrato pt-BR { titulo, modulos[].aulas[] }
//   -> rascunho no banco -> revisão humana -> publicação
//
// A SulSafe não roda OpenMAIC em Docker. O adaptador conversa com qualquer
// provedor configurado via config_ia_professor (BYOA / API da SulSafe).

import { NRS_CONHECIMENTO, buscarNR } from './base-conhecimento-sulsafe.js'

/** Tipos de geração que o botão "Criar com o TUTOR-Sulsafe" oferece. */
export const TIPOS_TUTOR = Object.freeze({
    MATERIA: 'MATERIA',
    CURSO: 'CURSO',
    PALESTRA: 'PALESTRA'
})

export const TIPOS_TUTOR_VALIDOS = Object.freeze(Object.values(TIPOS_TUTOR))

/** Limites alinhados ao contrato da MR e ao prompt do seed. */
export const LIMITES_TUTOR = Object.freeze({
    assuntoMin: 1,
    assuntoMax: 4000,
    tituloMax: 160,
    descricaoMax: 4000,
    objetivosMax: 20,
    modulosMax: 50,
    aulasPorModuloMax: 50,
    promptMax: 8000
})

// Instrução canônica de saída. Mantém o formato nativo do OpenMAIC para
// compatibilidade com o backend homologado; o adaptador faz a conversão.
export const INSTRUCAO_JSON_TUTOR = [
    'Ao criar conteúdo, responda exclusivamente com um objeto JSON válido, sem markdown, sem comentários e sem texto antes ou depois.',
    'Use o formato: {"languageDirective":"...","courseTitle":"...","outlines":[{"id":"c1","type":"slide","order":1,"title":"...","description":"...","keyPoints":["..."],"teachingObjective":"..."}]}.',
    'Gere exatamente 1 outline curto, em português do Brasil, com título e descrição de até 10 palavras.',
    'Baseie-se somente nas Normas Regulamentadoras informadas no contexto. Nunca invente requisito legal, prazo ou punição.'
].join(' ')

const ROTULOS_TIPO = Object.freeze({
    MATERIA: 'matéria de apoio',
    CURSO: 'curso',
    PALESTRA: 'palestra'
})

/**
 * Detecta NRs citadas no assunto (ex.: "NR 35", "nr-06") e devolve o catálogo
 * local correspondente. Usa o mesmo normalizador da Secretária SulSafe.
 */
export function extrairNRsDoAssunto(texto) {
    if (typeof texto !== 'string' || texto.trim() === '') return []

    const mencionadas = new Set()

    // Busca explícita por número (NR 35, nr-35, NR35, NR 035).
    // Reusa o normalizador da Secretária para manter as mesmas regras.
    const numeros = texto.match(/\bnr\s*0*\d{1,2}\b/gi) || []
    for (const trecho of numeros) {
        const encontrada = buscarNR(trecho)
        if (encontrada) mencionadas.add(encontrada.numero)
    }

    // Busca por título/nome dentro do catálogo local.
    const normalizado = texto.toLowerCase()
    for (const nr of NRS_CONHECIMENTO) {
        if (normalizado.includes(nr.titulo.toLowerCase()) ||
            normalizado.includes(`nr-${String(nr.numero).padStart(2, '0')}`)) {
            mencionadas.add(nr.numero)
        }
    }

    return NRS_CONHECIMENTO.filter(nr => mencionadas.has(nr.numero))
}

/** Contexto compacto das NRs relevantes, limitado para não estourar o prompt. */
function contextoDasNRs(nrs, limite = 6) {
    return nrs.slice(0, limite).map(nr => [
        `NR-${String(nr.numero).padStart(2, '0')}: ${nr.titulo}`,
        `Resumo: ${nr.descricao}`,
        `Objetivos: ${nr.objetivos.join('; ')}`
    ].join('\n')).join('\n\n')
}

const TIPOS_BASE_FASE5 = Object.freeze([...TIPOS_TUTOR_VALIDOS, 'PROVA'])
const ROTULOS_BASE_FASE5 = Object.freeze({ ...ROTULOS_TIPO, PROVA: 'prova de múltipla escolha' })

function montarPromptCom({ assunto, tipo, publicoAlvo, tiposPermitidos, rotulos, mensagemTipoInvalido }) {
    if (typeof assunto !== 'string' || assunto.trim().length < LIMITES_TUTOR.assuntoMin ||
        assunto.trim().length > LIMITES_TUTOR.assuntoMax) {
        throw new Error(`Informe o assunto (1 a ${LIMITES_TUTOR.assuntoMax} caracteres).`)
    }

    if (!tiposPermitidos.includes(tipo)) {
        throw new Error(mensagemTipoInvalido)
    }

    const nrs = extrairNRsDoAssunto(assunto)
    const rotulo = rotulos[tipo]

    const base = [
        'Você é o TUTOR-Sulsafe, especialista em Segurança do Trabalho e nas 38 Normas Regulamentadoras brasileiras.',
        `Crie uma estrutura de ${rotulo} para a plataforma SulSafe.`,
        'O conteúdo é destinado a trabalhadores, estudantes e profissionais de SST.',
        'Toda afirmação técnica deve ser atribuível a uma NR. Se o pedido pedir gabarito de prova, resposta de avaliação ou conteúdo fora das NRs, recuse no campo descricao.',
        nrs.length ? `Normas relacionadas ao pedido:\n${contextoDasNRs(nrs)}` : 'Nenhuma NR específica foi citada; escolha as NRs pertinentes ao assunto entre as 38 vigentes.',
        publicoAlvo ? `Público-alvo informado: ${String(publicoAlvo).trim().slice(0, 300)}` : ''
    ].filter(Boolean).join('\n\n')

    const requirement = `${base}\n\n${INSTRUCAO_JSON_TUTOR}\n\nPedido do instrutor: ${assunto.trim().slice(0, LIMITES_TUTOR.assuntoMax)}`

    return requirement.slice(0, LIMITES_TUTOR.promptMax)
}

/**
 * Monta o `requirement` enviado ao provedor de IA.
 * Segue a MR: prompt_base + instrução JSON + "Pedido do instrutor: ...".
 * Tipos legados permanecem com exatamente o mesmo contrato de antes.
 */
export function montarPromptTutor({ assunto, tipo = TIPOS_TUTOR.CURSO, publicoAlvo = '' } = {}) {
    return montarPromptCom({
        assunto,
        tipo,
        publicoAlvo,
        tiposPermitidos: TIPOS_TUTOR_VALIDOS,
        rotulos: ROTULOS_TIPO,
        mensagemTipoInvalido: 'Tipo de geração inválido. Use MATERIA, CURSO ou PALESTRA.'
    })
}

/**
 * Etapa 3.1: mesma base, mas com PROVA disponível. O prompt devolvido aqui é
 * o prompt_base persistido em ia_jobs.prompt; a instrução de quantidade é
 * acrescentada pelo worker (montarPromptFase5).
 */
export function montarPromptBaseFase5({ assunto, tipo = TIPOS_TUTOR.CURSO, publicoAlvo = '' } = {}) {
    return montarPromptCom({
        assunto,
        tipo,
        publicoAlvo,
        tiposPermitidos: TIPOS_BASE_FASE5,
        rotulos: ROTULOS_BASE_FASE5,
        mensagemTipoInvalido: 'Tipo de geração inválido. Use MATERIA, CURSO, PALESTRA ou PROVA.'
    })
}

function textoOuFallback(valor, fallback = '') {
    return typeof valor === 'string' && valor.trim() ? valor.trim() : fallback
}

function dedup(textos, limite) {
    const vistos = new Set()
    const resultado = []
    for (const texto of textos) {
        const limpo = textoOuFallback(texto)
        if (!limpo || vistos.has(limpo.toLowerCase())) continue
        vistos.add(limpo.toLowerCase())
        resultado.push(limpo)
        if (resultado.length >= limite) break
    }
    return resultado
}

function cortar(texto, limite) {
    return texto.length > limite ? `${texto.slice(0, limite - 1).trimEnd()}…` : texto
}

function extrairTema(texto) {
    const limpo = textoOuFallback(texto, 'Segurança do Trabalho')
    return cortar(limpo.replace(/^(crie|monte|gere|faça|quero)\s+(um|uma|o|a)?\s*/i, ''), 60)
}

/**
 * Converte o formato nativo do OpenMAIC para o contrato público da SulSafe.
 * Espelho direto de `adaptOpenMaicOutline()` da MR (3C).
 */
export function adaptarSaidaTutor(outline, assunto = '') {
    const bruto = outline && typeof outline === 'object' ? outline : {}
    const cenas = Array.isArray(bruto.outlines) ? bruto.outlines : []

    const utilizaveis = cenas
        .filter(cena => cena && typeof cena === 'object' && textoOuFallback(cena.title))
        .slice(0, LIMITES_TUTOR.modulosMax)
        .map((cena, indice) => ({
            ...cena,
            order: Number.isInteger(cena.order) && cena.order >= 0 ? cena.order : indice
        }))
        .sort((a, b) => a.order - b.order)

    const titulo = cortar(
        textoOuFallback(bruto.courseTitle) || textoOuFallback(utilizaveis[0]?.title) || `Curso de ${extrairTema(assunto)}`,
        LIMITES_TUTOR.tituloMax
    )

    const diretriz = textoOuFallback(bruto.languageDirective)
    const descricoes = dedup([
        diretriz,
        ...utilizaveis.map(cena => textoOuFallback(cena.description))
    ], 20)

    const descricao = cortar(descricoes.join(' ') || titulo, LIMITES_TUTOR.descricaoMax)

    const objetivosBrutos = dedup([
        ...utilizaveis.map(cena => textoOuFallback(cena.teachingObjective)),
        ...utilizaveis.flatMap(cena => Array.isArray(cena.keyPoints) ? cena.keyPoints.map(textoOuFallback) : [])
    ], LIMITES_TUTOR.objetivosMax)

    const objetivos = objetivosBrutos.length ? objetivosBrutos : [cortar(descricao, 4000)]
    const publicoAlvo = cortar(objetivos[0] || diretriz || titulo, LIMITES_TUTOR.descricaoMax)

    const modulos = utilizaveis.map(cena => {
        const tituloModulo = cortar(textoOuFallback(cena.title), LIMITES_TUTOR.tituloMax)
        const descricaoModulo = cortar(
            textoOuFallback(cena.teachingObjective) || textoOuFallback(cena.description) || tituloModulo,
            LIMITES_TUTOR.descricaoMax
        )

        const partesAula = dedup([
            textoOuFallback(cena.description),
            ...(Array.isArray(cena.keyPoints) ? cena.keyPoints.map(textoOuFallback) : []),
            textoOuFallback(cena.teachingObjective)
        ].filter(parte => parte && parte.toLowerCase() !== tituloModulo.toLowerCase()), 5)

        return {
            titulo: tituloModulo,
            descricao: descricaoModulo,
            aulas: [{
                titulo: tituloModulo,
                descricao: cortar(partesAula.join(' ') || tituloModulo, 20000)
            }]
        }
    })

    if (!modulos.length) {
        modulos.push({
            titulo: titulo,
            descricao: descricao,
            aulas: [{ titulo: titulo, descricao: descricao }]
        })
    }

    return { titulo, descricao, publicoAlvo, objetivos, modulos }
}

/** Valida o contrato público antes de gravar no banco. */
export function validarContratoTutor(contrato) {
    const erros = []
    const c = contrato && typeof contrato === 'object' ? contrato : {}

    const titulo = textoOuFallback(c.titulo)
    if (!titulo || titulo.length > LIMITES_TUTOR.tituloMax) erros.push('título inválido')

    const descricao = textoOuFallback(c.descricao)
    if (!descricao || descricao.length > LIMITES_TUTOR.descricaoMax) erros.push('descrição inválida')

    const publicoAlvo = textoOuFallback(c.publicoAlvo)
    if (!publicoAlvo || publicoAlvo.length > LIMITES_TUTOR.descricaoMax) erros.push('público-alvo inválido')

    if (!Array.isArray(c.objetivos) || c.objetivos.length < 1 ||
        c.objetivos.length > LIMITES_TUTOR.objetivosMax ||
        c.objetivos.some(o => !textoOuFallback(o))) {
        erros.push('objetivos inválidos')
    }

    if (!Array.isArray(c.modulos) || c.modulos.length < 1 || c.modulos.length > LIMITES_TUTOR.modulosMax) {
        erros.push('módulos inválidos')
    } else {
        c.modulos.forEach((modulo, i) => {
            if (!modulo || !textoOuFallback(modulo.titulo) || textoOuFallback(modulo.titulo).length > LIMITES_TUTOR.tituloMax) {
                erros.push(`módulo ${i + 1} sem título válido`)
            }
            if (!Array.isArray(modulo.aulas) || modulo.aulas.length < 1 ||
                modulo.aulas.length > LIMITES_TUTOR.aulasPorModuloMax ||
                modulo.aulas.some(a => !a || !textoOuFallback(a.titulo))) {
                erros.push(`módulo ${i + 1} sem aulas válidas`)
            }
        })
    }

    return { valido: erros.length === 0, erros }
}

/**
 * Formato gravado em `ia_conteudos.conteudo`: o contrato público mais metadados
 * de proveniência. Nunca inclui chave, token ou prompt_base.
 */
export function conteudoParaRascunho(contrato, { jobId, tipo, nrs = [] } = {}) {
    const validacao = validarContratoTutor(contrato)
    if (!validacao.valido) {
        throw new Error(`Saída inválida do Tutor-Sulsafe: ${validacao.erros.join(', ')}`)
    }

    return Object.freeze({
        versao: 1,
        origem: 'TUTOR_SULSAFE',
        job_id: jobId || null,
        tipo: tipo || TIPOS_TUTOR.CURSO,
        nrs_referenciadas: nrs.map(nr => nr.numero),
        titulo: contrato.titulo,
        descricao: contrato.descricao,
        publico_alvo: contrato.publicoAlvo,
        objetivos: Object.freeze([...contrato.objetivos]),
        modulos: Object.freeze(contrato.modulos.map(modulo => Object.freeze({
            titulo: modulo.titulo,
            descricao: modulo.descricao,
            aulas: Object.freeze(modulo.aulas.map(aula => Object.freeze({
                titulo: aula.titulo,
                descricao: aula.descricao
            })))
        })))
    })
}
