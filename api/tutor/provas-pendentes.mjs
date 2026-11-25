// ============================================================
// ROTA HITL — GET /api/tutor/provas-pendentes
// ============================================================
// Fase 5, Etapa 3. Lista provas geradas pelo Tutor que ainda aguardam
// aprovação. A chamada é feita com o JWT do professor/admin e a chave
// ANÔNIMA: service_role nunca aparece aqui. A RPC devolve somente metadados;
// esta rota aplica uma segunda whitelist antes de responder.
// ============================================================

const CAMPOS_PERMITIDOS = Object.freeze([
    'conteudo_id',
    'prova_id',
    'job_id',
    'titulo',
    'descricao',
    'nr_id',
    'quantidade_questoes',
    'publicado',
    'aprovado',
    'rejeitado',
    'criado_em'
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

/** Handler Vercel (Node). Nenhuma chave secreta é lida além da anônima pública. */
export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
    }

    if (req.method !== 'GET') {
        responder(res, 405, {
            error: { code: 'METODO_INVALIDO', message: 'Use GET.' }
        })
        return
    }

    const token = tokenDoPedido(req)
    if (!token) {
        responder(res, 401, {
            error: { code: 'NAO_AUTENTICADO', message: 'Faça login para ver a fila de provas.' }
        })
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

    try {
        const resposta = await fetch(
            `${url.replace(/\/$/, '')}/rest/v1/rpc/sulsafe_listar_provas_pendentes_ia`,
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
            const detalhe = await resposta.text().catch(() => '')
            responder(res, resposta.status === 401 || resposta.status === 403 ? resposta.status : 502, {
                error: {
                    code: 'FILA_INDISPONIVEL',
                    message: resposta.status === 403
                        ? 'Somente administradores e professores podem ver esta fila.'
                        : 'Não foi possível carregar a fila de provas.'
                }
            })
            return
        }

        const bruto = await resposta.json()
        const itens = Array.isArray(bruto) ? bruto : []
        const provas = itens.map(item => Object.fromEntries(
            CAMPOS_PERMITIDOS
                .filter(campo => Object.prototype.hasOwnProperty.call(item, campo))
                .map(campo => [campo, item[campo]])
        ))

        responder(res, 200, { provas })
    } catch {
        responder(res, 502, {
            error: { code: 'FILA_INDISPONIVEL', message: 'Não foi possível carregar a fila de provas.' }
        })
    }
}
