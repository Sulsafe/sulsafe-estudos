// ============================================================
// FASE 5 — DISPATCHER DO WORKER (DENO + NODE)
// ============================================================
// Camada pura: não lê env, não importa zod e não conhece supabase-js.
// Recebe o prompt_base lido do banco (ia_jobs.prompt), o cliente de banco
// injetado, o validador do núcleo Zod da Etapa 1 e um gerador (Gemini no
// runtime, mock nos testes). Assim o mesmo código roda na Edge Function e
// no Node sem duplicar regra de contrato.
//
// Segredo nunca entra aqui: o gerador já recebe a chave somente no runtime.
// ============================================================

import { extrairJson } from './extrair-json.js'
import {
    QUANTIDADE_QUESTOES_PADRAO,
    normalizarQuantidadeQuestoes
} from '../../../js/tutor-contratos-fase5-core.js'

// Somente PROVA e MODULO entram no dispatcher da Etapa 3. PALESTRA continua
// no fluxo legado de videoaulas/materiais da Edge Function (não se altera).
export const TIPOS_GERACAO_FASE5 = Object.freeze(['PROVA', 'MODULO'])
// O núcleo Zod da Etapa 1 também conhece PALESTRA; os builders abaixo o
// aceitam sem que isso signifique desviar o job legado para o novo fluxo.
const TIPOS_CO_CONTRATO_FASE5 = Object.freeze([...TIPOS_GERACAO_FASE5, 'PALESTRA'])
export const STATUS_SUCESSO = 'CONCLUIDO'
export const STATUS_FALHA = 'ERRO'
export const MODO_RASCUNHO_IA = 'RASCUNHO_IA'

function normalizar(tipo, permitidos) {
    const normalizado = String(tipo || '').trim().toUpperCase()
    return permitidos.includes(normalizado) ? normalizado : null
}

export function normalizarTipoFase5(tipo) {
    return normalizar(tipo, TIPOS_GERACAO_FASE5)
}

function normalizarTipoContrato(tipo) {
    return normalizar(tipo, TIPOS_CO_CONTRATO_FASE5)
}

const SISTEMA = Object.freeze({
    PROVA: 'Você é o TUTOR-Sulsafe, especialista em Segurança do Trabalho e nas 38 NRs brasileiras. Gere avaliações técnicas, objetivas e integralmente atribuíveis às NRs citadas.',
    MODULO: 'Você é o TUTOR-Sulsafe, especialista em Segurança do Trabalho e nas 38 NRs brasileiras. Gere módulos de ensino com objetivos e aulas progressivas.',
    PALESTRA: 'Você é o TUTOR-Sulsafe, especialista em Segurança do Trabalho e nas 38 NRs brasileiras. Gere roteiros de palestra com blocos e duração realista.'
})

function instrucaoSaida(tipo, quantidadeQuestoes) {
    if (tipo === 'PROVA') {
        return [
            `Gere exatamente ${quantidadeQuestoes} questões de múltipla escolha sobre o assunto pedido, com 5 alternativas (A-E) e apenas uma correta por questão.`,
            'Cada justificativa deve citar a NR aplicável. Não invente normas, artigos ou requisitos fora das 38 NRs.',
            'Retorne em JSON estrito, sem markdown, sem texto antes ou depois, usando exatamente este formato:',
            '{ "titulo": "string", "descricao": "string opcional", "nr_id": 35, "questoes": [',
            '  { "enunciado": "string", "alternativas": [{"chave":"A","texto":"string"},{"chave":"B","texto":"string"},{"chave":"C","texto":"string"},{"chave":"D","texto":"string"},{"chave":"E","texto":"string"}],',
            '    "resposta_correta": "A", "justificativa": "string", "peso": 1 }',
            '] }',
            'A chave resposta_correta deve ser uma das chaves das alternativas. Use somente as chaves A, B, C, D e E.'
        ].join('\n')
    }

    if (tipo === 'MODULO') {
        return [
            'Retorne em JSON estrito, sem markdown, sem texto antes ou depois, usando exatamente este formato:',
            '{ "titulo": "string", "descricao": "string opcional", "publicoAlvo": "string opcional",',
            '  "objetivos": ["string"], "aulas": [{"titulo":"string","descricao":"string opcional","ordem":0}] }',
            'Use ao menos um objetivo e uma aula; a ordem começa em 0 e cresce sem repetição.'
        ].join('\n')
    }

    return [
        'Retorne em JSON estrito, sem markdown, sem texto antes ou depois, usando exatamente este formato:',
        '{ "titulo": "string", "descricao": "string opcional", "publicoAlvo": "string opcional",',
        '  "duracao_min": 60, "roteiro": [{"bloco":"string","minutos":15,"conteudo":"string"}] }',
        'A soma dos minutos dos blocos deve ser igual a duracao_min.'
    ].join('\n')
}

/**
 * Monta o prompt específico por tipo reaproveitando o prompt_base persistido
 * pelo front em `ia_jobs.prompt` (o "prompt_base" da MR, já com as NRs).
 */
export function montarPromptFase5(tipo, promptBase, opcoes = {}) {
    const tipoNormalizado = normalizarTipoContrato(tipo)
    if (!tipoNormalizado) {
        throw new Error(`Tipo de geração não suportado pela Fase 5: ${tipo || 'vazio'}.`)
    }

    const base = typeof promptBase === 'string' && promptBase.trim()
        ? promptBase.trim()
        : '(sem base adicional)'

    return [
        `SYSTEM — ${SISTEMA[tipoNormalizado]}`,
        'BASE DO PEDIDO (lida do banco, ia_jobs.prompt):',
        base,
        instrucaoSaida(tipoNormalizado, normalizarQuantidadeQuestoes(opcoes.quantidadeQuestoes))
    ].join('\n\n')
}

function temaDoPrompt(prompt) {
    const limpo = String(prompt || '').split('Pedido do instrutor:').pop().trim()
    const titulo = limpo.replace(/^(crie|monte|gere|faça|quero)\s+(um|uma|o|a)?\s*/i, '')
    return (titulo || 'Segurança no Trabalho').slice(0, 120)
}

function cortar(texto, limite) {
    return String(texto || '').slice(0, limite)
}

/** Saída determinística para o modo stub (sem chave e sem rede). */
export function gerarStubFase5(tipo, prompt, opcoes = {}) {
    const tipoNormalizado = normalizarTipoContrato(tipo)
    if (!tipoNormalizado) {
        throw new Error(`Tipo de geração não suportado pela Fase 5: ${tipo || 'vazio'}.`)
    }

    const titulo = temaDoPrompt(prompt)
    const nrMatch = String(prompt || '').match(/NR-?(\d{1,2})/i)
    const nrId = nrMatch ? Number(nrMatch[1]) : null
    const quantidade = normalizarQuantidadeQuestoes(opcoes.quantidadeQuestoes)

    if (tipoNormalizado === 'PROVA') {
        return {
            titulo: cortar(`Prova de ${titulo}`, 200),
            descricao: `Avaliação gerada localmente sobre ${titulo}, em modo de revisão.`,
            nr_id: nrId && nrId >= 1 && nrId <= 38 ? nrId : null,
            questoes: Array.from({ length: quantidade }, (_, indice) => ({
                enunciado: `Questão ${indice + 1}: qual medida é exigida pela NR relacionada a ${titulo}?`,
                alternativas: [
                    { chave: 'A', texto: 'Medida preventiva prevista na NR' },
                    { chave: 'B', texto: 'Medida apenas recomendada, sem exigência' },
                    { chave: 'C', texto: 'Procedimento opcional do empregador' },
                    { chave: 'D', texto: 'Registro sem respaldo normativo' },
                    { chave: 'E', texto: 'Alternativa fora do escopo da NR' }
                ],
                resposta_correta: 'A',
                justificativa: 'A NR aplicável exige medida preventiva correspondente ao risco.',
                peso: 1
            }))
        }
    }

    if (tipoNormalizado === 'MODULO') {
        return {
            titulo: cortar(`Módulo de ${titulo}`, 200),
            descricao: `Módulo gerado localmente sobre ${titulo}, em modo de revisão.`,
            publicoAlvo: 'Trabalhadores e profissionais de Segurança do Trabalho',
            objetivos: [
                `Identificar os requisitos aplicáveis a ${titulo}.`,
                'Aplicar as medidas de prevenção previstas na NR correspondente.',
                'Registrar corretamente as evidências exigidas.'
            ],
            aulas: [0, 1, 2].map(ordem => ({
                titulo: `Aula ${ordem + 1} — ${titulo}`,
                descricao: `Parte ${ordem + 1} do conteúdo sobre ${titulo}, gerada localmente para revisão.`,
                ordem
            }))
        }
    }

    return {
        titulo: cortar(`Palestra sobre ${titulo}`, 200),
        descricao: `Roteiro gerado localmente sobre ${titulo}, em modo de revisão.`,
        publicoAlvo: 'Trabalhadores e profissionais de Segurança do Trabalho',
        duracao_min: 60,
        roteiro: [
            { bloco: 'Abertura', minutos: 10, conteudo: `Contexto e importância de ${titulo}.` },
            { bloco: 'Desenvolvimento', minutos: 35, conteudo: `Requisitos práticos da NR aplicável a ${titulo}.` },
            { bloco: 'Encerramento', minutos: 15, conteudo: 'Perguntas, recapitulação e próximos passos.' }
        ]
    }
}

function extrairSaida(bruto) {
    if (typeof bruto === 'string') return extrairJson(bruto)
    if (bruto && typeof bruto === 'object' && !Array.isArray(bruto)) return bruto
    throw new Error('O provedor não retornou um objeto JSON válido')
}

function conteudoDoRascunho(tipo, dados, job) {
    const comum = {
        versao: 1,
        origem: 'TUTOR_SULSAFE',
        job_id: job.id,
        tipo,
        titulo: dados.titulo,
        descricao: dados.descricao ?? null,
        nr_id: dados.nr_id ?? null
    }

    if (tipo === 'PROVA') {
        // Registra no rascunho a quantidade efetivamente validada, para que a
        // auditoria e a materialização possam conferir o pedido do instrutor.
        return {
            ...comum,
            quantidade_questoes: dados.questoes.length,
            questoes: dados.questoes
        }
    }
    if (tipo === 'MODULO') {
        return {
            ...comum,
            publicoAlvo: dados.publicoAlvo ?? null,
            objetivos: dados.objetivos,
            aulas: dados.aulas
        }
    }
    return {
        ...comum,
        publicoAlvo: dados.publicoAlvo ?? null,
        duracao_min: dados.duracao_min,
        roteiro: dados.roteiro
    }
}

/**
 * Orquestra a geração de um job da Fase 5 usando cliente e gerador injetados.
 * Nenhuma gravação acontece antes da validação do JSON pelo contrato Zod.
 */
export async function processarJobFase5({
    cliente,
    job,
    validarSaidaIA,
    gerador,
    quantidadeQuestoesPadrao = QUANTIDADE_QUESTOES_PADRAO
}) {
    const tipo = normalizarTipoFase5(job?.tipo)
    if (!tipo) {
        throw new Error(`Tipo de geração não suportado pela Fase 5: ${job?.tipo || 'vazio'}.`)
    }
    if (typeof validarSaidaIA !== 'function' || typeof gerador !== 'function') {
        throw new Error('Validador e gerador são obrigatórios')
    }

    // A quantidade escolhida no form viaja no job. Nada é gravado se ela
    // estiver fora de 1..50 — a checagem acontece antes do gerador e da RPC.
    const opcoes = tipo === 'PROVA'
        ? {
            quantidadeQuestoes: normalizarQuantidadeQuestoes(
                job?.quantidade_questoes ?? quantidadeQuestoesPadrao
            )
        }
        : {}

    const prompt = montarPromptFase5(tipo, job?.prompt, opcoes)
    const bruto = await gerador(prompt, opcoes)
    const dadosValidados = extrairSaida(bruto)
    const validacao = validarSaidaIA(tipo, dadosValidados, opcoes)

    if (!validacao.sucesso) {
        throw new Error(`Saída inválida da I.A.: ${validacao.erros.join('; ')}`)
    }

    const conteudo = conteudoDoRascunho(tipo, validacao.dados, job)
    const { data: conteudoId, error: erroSalvar } = await cliente.rpc('sulsafe_salvar_ia_conteudo', {
        p_job_id: job.id,
        p_tipo: tipo,
        // Mantém o título do instrutor (job.titulo), como no fluxo legado;
        // o título sugerido pela I.A. fica registrado dentro do conteúdo.
        p_titulo: String(job.titulo || '').trim() || conteudo.titulo,
        p_conteudo: conteudo
    })

    if (erroSalvar) {
        throw new Error(erroSalvar.message || 'Não foi possível salvar o rascunho gerado')
    }

    let prova = null
    if (tipo === 'PROVA') {
        const materia = await cliente.rpc('sulsafe_materializar_prova_ia', {
            p_conteudo_id: conteudoId,
            p_modo: MODO_RASCUNHO_IA
        })
        if (materia.error) {
            throw new Error(materia.error.message || 'Não foi possível materializar a prova')
        }
        prova = materia.data || {}
    }

    const { error: erroStatus } = await cliente.rpc('sulsafe_atualizar_status_ia_job', {
        p_job_id: job.id,
        p_status: STATUS_SUCESSO,
        p_resultado: validacao.dados
    })

    if (erroStatus) {
        throw new Error(erroStatus.message || 'Não foi possível concluir o job')
    }

    // HITL: a prova materializada pelo worker nasce SEMPRE como rascunho.
    // `publicado` reflete o estado real da prova (false), não o fato de ter
    // sido materializada.
    const publicado = prova ? Boolean(prova.publicado) : false
    return {
        tipo,
        conteudoId,
        dados: validacao.dados,
        provaId: prova?.prova_id ?? null,
        publicado,
        resposta: {
            jobId: job.id,
            jobStatus: STATUS_SUCESSO,
            tipo,
            conteudoId,
            provaId: prova?.prova_id ?? null,
            publicado,
            contrato: validacao.dados
        }
    }
}

/** Registra a falha no job (equivalente a FAILED na enum do banco: ERRO). */
export async function registrarFalhaJob(cliente, jobId, mensagem) {
    const texto = String(mensagem || 'Erro inesperado na geração').slice(0, 2000)
    await cliente.rpc('sulsafe_atualizar_status_ia_job', {
        p_job_id: jobId,
        p_status: STATUS_FALHA,
        p_erro_mensagem: texto
    })
}
