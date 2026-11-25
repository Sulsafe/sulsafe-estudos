// ============================================================
// GET /api/tutor/provas/:id/resultados/:alunoId — ETAPA 7/8
// ============================================================
// Detalhe de uma avaliação para revisão do professor: respostas, nota e
// gabarito. A RPC autoriza empresa/papel antes de devolver o gabarito;
// esta rota só repassa os campos esperados e nunca lê chave de serviço.
// ============================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const CAMPOS_DETALHE = Object.freeze([
    'prova_id',
    'aluno_id',
    'aluno_nome',
    'status',
    'nota',
    'concluido_em',
    'possui_discursiva',
    'questoes'
])

const CAMPOS_QUESTAO = Object.freeze([
    'id',
    'ordem',
    'enunciado',
    'tipo',
    'peso',
    'alternativas',
    'resposta_aluno',
    'nota_manual',
    'gabarito'
])

function responder(res, status, corpo) {
    res.statusCode = status
    if (typeof res.setHeader === 'function') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('Vary', 'Origin')
    }
    res.end(JSON.stringify(corpo))
}

function tokenDoPedido(req) {
    const cabecalho = req?.headers?.authorization || req?.headers?.Authorization || ''
    return String(cabecalho).replace(/^Bearer\s+/i, '').trim()
}

function idsDoPedido(req) {
    const direto = req?.query?.id || req?.query?.[0]
    const aluno = req?.query?.alunoId || req?.query?.aluno_id || req?.query?.[1]
    if (direto || aluno) return { provaId: String(direto || ''), alunoId: String(aluno || '') }

    try {
        const trecho = new URL(req?.url || '/', 'http://localhost').pathname
            .match(/\/api\/tutor\/provas\/([^/]+)\/resultados\/([^/]+)/i)
        return trecho
            ? { provaId: decodeURIComponent(trecho[1]), alunoId: decodeURIComponent(trecho[2]) }
            : { provaId: '', alunoId: '' }
    } catch {
        return { provaId: '', alunoId: '' }
    }
}

function filtrar(objeto, campos) {
    if (!objeto || typeof objeto !== 'object') return {}
    return Object.fromEntries(
        campos
            .filter(campo => Object.prototype.hasOwnProperty.call(objeto, campo))
            .map(campo => [campo, objeto[campo]])
    )
}

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
    }

    if (req.method !== 'GET') {
        responder(res, 405, { error: { code: 'METODO_INVALIDO', message: 'Use GET.' } })
        return
    }

    const token = tokenDoPedido(req)
    if (!token) {
        responder(res, 401, {
            error: { code: 'NAO_AUTENTICADO', message: 'Faça login para ver o detalhe.' }
        })
        return
    }

    const { provaId, alunoId } = idsDoPedido(req)
    if (!UUID.test(provaId) || !UUID.test(alunoId)) {
        responder(res, 400, { error: { code: 'ID_INVALIDO', message: 'Prova ou aluno inválido.' } })
        return
    }

    const url = process.env.SUPABASE_URL
    const anonKey = process.env.SUPABASE_ANON_KEY
    if (!url || !anonKey) {
        responder(res, 500, {
            error: { code: 'CONFIGURACAO_AUSENTE', message: 'API de conteúdo não configurada.' }
        })
        return
    }

    const parametros = new URLSearchParams({ p_prova_id: provaId, p_aluno_id: alunoId })

    try {
        const resposta = await fetch(
            `${url.replace(/\/$/, '')}/rest/v1/rpc/sulsafe_detalhe_resultado_prova_ia?${parametros}`,
            {
                method: 'GET',
                headers: {
                    apikey: anonKey,
                    authorization: `Bearer ${token}`,
                    accept: 'application/json'
                },
                cache: 'no-store'
            }
        )

        if (!resposta.ok) {
            const status = resposta.status === 401 || resposta.status === 403 ? resposta.status : 502
            responder(res, status, {
                error: {
                    code: status === 403 ? 'SEM_PERMISSAO' : 'DETALHE_INDISPONIVEL',
                    message: status === 403
                        ? 'Sem permissão para visualizar o resultado deste aluno.'
                        : 'Não foi possível carregar o detalhe.'
                }
            })
            return
        }

        const bruto = await resposta.json()
        const detalhe = filtrar(bruto, CAMPOS_DETALHE)
        if (Array.isArray(detalhe.questoes)) {
            detalhe.questoes = detalhe.questoes.map(questao => filtrar(questao, CAMPOS_QUESTAO))
        }

        responder(res, 200, { detalhe })
    } catch {
        responder(res, 502, {
            error: { code: 'DETALHE_INDISPONIVEL', message: 'Não foi possível carregar o detalhe.' }
        })
    }
}
