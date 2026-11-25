// ============================================================
// GET /api/tutor/provas/:id/resultados — ETAPA 7/8
// ============================================================
// Resultados da prova para o professor/admin da empresa da prova. JWT do
// chamador + chave ANÔNIMA no servidor; nenhuma chave de serviço é usada.
// A RPC já filtra por empresa; esta rota ainda aplica whitelist de campos.
// ============================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CAMPOS_PERMITIDOS = Object.freeze([
    'aluno_id',
    'nome_completo',
    'status',
    'nota',
    'concluido_em',
    'possui_discursiva'
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

function idDoPedido(req) {
    const direto = req?.query?.id || req?.query?.[0]
    if (direto) return String(direto)

    try {
        const caminho = new URL(req?.url || '/', 'http://localhost').pathname
        const trecho = caminho.match(/\/api\/tutor\/provas\/([^/]+)\/resultados/i)
        return trecho ? decodeURIComponent(trecho[1]) : ''
    } catch {
        return ''
    }
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
            error: { code: 'NAO_AUTENTICADO', message: 'Faça login para ver os resultados.' }
        })
        return
    }

    const provaId = idDoPedido(req)
    if (!UUID.test(provaId)) {
        responder(res, 400, { error: { code: 'ID_INVALIDO', message: 'Prova inválida.' } })
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

    const parametros = new URLSearchParams({ p_prova_id: provaId })

    try {
        const resposta = await fetch(
            `${url.replace(/\/$/, '')}/rest/v1/rpc/sulsafe_listar_resultados_prova_ia?${parametros}`,
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
                    code: status === 403 ? 'SEM_PERMISSAO' : 'RESULTADOS_INDISPONIVEIS',
                    message: status === 403
                        ? 'Somente professores da empresa da prova podem ver estes resultados.'
                        : 'Não foi possível carregar os resultados.'
                }
            })
            return
        }

        const bruto = await resposta.json()
        const itens = Array.isArray(bruto) ? bruto : []
        const resultados = itens.map(item => Object.fromEntries(
            CAMPOS_PERMITIDOS
                .filter(campo => Object.prototype.hasOwnProperty.call(item, campo))
                .map(campo => [campo, item[campo]])
        ))

        responder(res, 200, { resultados })
    } catch {
        responder(res, 502, {
            error: {
                code: 'RESULTADOS_INDISPONIVEIS',
                message: 'Não foi possível carregar os resultados.'
            }
        })
    }
}
