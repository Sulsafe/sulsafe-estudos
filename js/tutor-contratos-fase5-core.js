// ============================================================
// CONTRATOS DA FASE 5 — NÚCLEO INDEPENDENTE DE RUNTIME
// ============================================================
// Este arquivo NÃO importa Zod: recebe a instância por parâmetro.
// Assim o mesmo contrato serve ao Node (js/tutor-contratos-fase5.js)
// e, na Etapa 3, à Edge Function Deno (npm:zod), sem duplicar regras.
//
// Textos de erro em pt-BR. Identificadores técnicos em inglês.
// ============================================================

export const TIPOS_FASE5 = Object.freeze(['PROVA', 'MODULO', 'PALESTRA'])

// Etapa 3.1: a quantidade de questões é um parâmetro explícito do job. O
// padrão preserva as provas de 10 questões já homologadas; o teto de 50 é
// uma regra de segurança aplicada no front, na RPC, no worker e no contrato.
export const QUANTIDADE_QUESTOES_PADRAO = 10
export const QUANTIDADE_QUESTOES_MAX = 50
export const QUANTIDADES_PROVA_PERMITIDAS = Object.freeze([5, 10, 20, 30, 50])

export function normalizarQuantidadeQuestoes(valor) {
    if (valor === null || valor === undefined || valor === '') {
        return QUANTIDADE_QUESTOES_PADRAO
    }

    if (typeof valor !== 'number' && typeof valor !== 'string') {
        throw new Error('A quantidade de questões deve ser um número inteiro.')
    }

    const numero = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor

    if (!Number.isInteger(numero)) {
        throw new Error('A quantidade de questões deve ser um número inteiro.')
    }
    if (numero < 1) {
        throw new Error('A prova deve ter pelo menos 1 questão.')
    }
    if (numero > QUANTIDADE_QUESTOES_MAX) {
        throw new Error(`A prova pode ter no máximo ${QUANTIDADE_QUESTOES_MAX} questões.`)
    }

    return numero
}

const TIPOS_PT = Object.freeze({
    string: 'texto',
    number: 'número',
    integer: 'número inteiro',
    array: 'lista',
    object: 'objeto',
    boolean: 'verdadeiro/falso',
    undefined: 'valor ausente',
    null: 'nulo'
})

function mensagemPtBR(issue, ctx) {
    const textoPadrao = ctx?.defaultError || issue.message || 'Valor inválido.'

    switch (issue.code) {
        case 'invalid_type':
            return `Esperado ${TIPOS_PT[issue.expected] || issue.expected}, mas recebido ${TIPOS_PT[issue.received] || issue.received}.`

        case 'too_small':
            if (issue.exact !== undefined) {
                const quantidade = issue.minimum ?? issue.maximum
                return `Envie exatamente ${quantidade} item(ns).`
            }
            if (issue.type === 'string') {
                return `Texto muito curto (mínimo de ${issue.minimum} caractere(s)).`
            }
            if (issue.type === 'number') {
                return `Valor abaixo do mínimo permitido (${issue.minimum}).`
            }
            return `Envie no mínimo ${issue.minimum} item(ns).`

        case 'too_big':
            if (issue.exact !== undefined) {
                const quantidade = issue.minimum ?? issue.maximum
                return `Envie exatamente ${quantidade} item(ns).`
            }
            if (issue.type === 'string') {
                return `Texto muito longo (máximo de ${issue.maximum} caractere(s)).`
            }
            if (issue.type === 'number') {
                return `Valor acima do máximo permitido (${issue.maximum}).`
            }
            return `Envie no máximo ${issue.maximum} item(ns).`

        case 'unrecognized_keys':
            return `Campo(s) não permitido(s): ${(issue.keys || []).join(', ')}.`

        case 'invalid_string':
            return /^invalid|^string must/i.test(textoPadrao) ? 'Formato inválido.' : textoPadrao

        case 'invalid_literal':
            return 'Valor não corresponde ao esperado.'

        case 'custom':
            return textoPadrao

        default:
            return textoPadrao
    }
}

function caminhoIssue(issue) {
    return (issue.path || []).map(parte => String(parte)).join('.') || 'raiz'
}

export function criarContratosFase5(z) {
    const texto = (limite) => z.string().trim().min(1).max(limite)
    const chaveAlternativa = z.string().trim().toUpperCase().regex(/^[A-E]$/, 'Use A, B, C, D ou E.')

    const alternativaSchema = z.object({
        chave: chaveAlternativa,
        texto: texto(500)
    }).strict()

    const questaoSchema = z.object({
        enunciado: texto(1000),
        alternativas: z.array(alternativaSchema).min(2).max(5),
        resposta_correta: chaveAlternativa,
        justificativa: texto(1000).nullish(),
        peso: z.number().int().min(1).max(10).default(1)
    }).strict().superRefine((questao, ctx) => {
        const chaves = questao.alternativas.map(alternativa => alternativa.chave)

        if (new Set(chaves).size !== chaves.length) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['alternativas'],
                message: 'Chaves de alternativas repetidas.'
            })
        }

        if (!chaves.includes(questao.resposta_correta)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['resposta_correta'],
                message: 'O gabarito deve ser uma das alternativas.'
            })
        }
    })

    const provaSchema = z.object({
        titulo: texto(200),
        descricao: texto(4000).nullish(),
        nr_id: z.number().int().min(1).max(38).nullish(),
        questoes: z.array(questaoSchema).min(1).max(50)
    }).strict()

    const provaComQuestoesSchema = (quantidade = QUANTIDADE_QUESTOES_PADRAO) => {
        const quantidadeValida = normalizarQuantidadeQuestoes(quantidade)
        return provaSchema.extend({
            questoes: z.array(questaoSchema)
                .min(1)
                .max(QUANTIDADE_QUESTOES_MAX)
                .length(quantidadeValida)
        })
    }

    const aulaSchema = z.object({
        titulo: texto(200),
        descricao: texto(4000).nullish(),
        ordem: z.number().int().min(0).default(0)
    }).strict()

    const moduloSchema = z.object({
        titulo: texto(200),
        descricao: texto(4000).nullish(),
        publicoAlvo: texto(500).nullish(),
        objetivos: z.array(texto(500)).min(1).max(20),
        aulas: z.array(aulaSchema).min(1).max(50)
    }).strict()

    const blocoPalestraSchema = z.object({
        bloco: texto(120),
        minutos: z.number().int().min(1).max(480),
        conteudo: texto(4000)
    }).strict()

    const palestraSchema = z.object({
        titulo: texto(200),
        descricao: texto(4000).nullish(),
        publicoAlvo: texto(500).nullish(),
        duracao_min: z.number().int().min(1).max(480),
        roteiro: z.array(blocoPalestraSchema).min(1).max(30)
    }).strict()

    function validarSaidaIA(tipo, dados, opcoes = {}) {
        const tipoNormalizado = String(tipo || '').trim().toUpperCase()

        if (!TIPOS_FASE5.includes(tipoNormalizado)) {
            return {
                sucesso: false,
                erros: [`Tipo de I.A. não suportado: ${tipo || 'vazio'}.`]
            }
        }

        let schema
        if (tipoNormalizado === 'PROVA') {
            let quantidade
            try {
                quantidade = normalizarQuantidadeQuestoes(opcoes.quantidadeQuestoes)
            } catch (erro) {
                return {
                    sucesso: false,
                    erros: [`quantidadeQuestoes: ${erro.message}`]
                }
            }
            schema = provaComQuestoesSchema(quantidade)
        } else {
            schema = tipoNormalizado === 'MODULO' ? moduloSchema : palestraSchema
        }

        // A tradução para pt-BR é feita em mensagemPtBR ao montar `erros`.
        // Mantemos safeParse sem opções específicas de versão do Zod para que o
        // mesmo núcleo funcione no Node e na Edge Function (Deno).
        const resultado = schema.safeParse(dados)

        if (resultado.success) {
            return { sucesso: true, dados: resultado.data }
        }

        return {
            sucesso: false,
            erros: resultado.error.issues.map(issue => `${caminhoIssue(issue)}: ${mensagemPtBR(issue, { defaultError: issue.message })}`)
        }
    }

    return {
        alternativaSchema,
        questaoSchema,
        provaSchema,
        provaComQuestoesSchema,
        moduloSchema,
        palestraSchema,
        validarSaidaIA,
        mensagemPtBR
    }
}
