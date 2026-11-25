// ============================================================
// BASE DAS ROTAS DE DECISÃO HITL (APROVAR / REJEITAR)
// ============================================================
// JWT do chamador + chave ANÔNIMA. service_role nunca aparece aqui.
// A autorização real (papel, empresa, estado da prova) é feita pela RPC.
// ============================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
        const trecho = caminho.match(/\/api\/tutor\/provas\/([^/]+)\/(?:aprovar|rejeitar)/i)
        return trecho ? decodeURIComponent(trecho[1]) : ''
    } catch {
        return ''
    }
}

function corpoDoPedido(req) {
    const bruto = req?.body
    if (!bruto) return {}
    if (typeof bruto === 'object') return bruto
    try {
        const analisado = JSON.parse(String(bruto))
        return analisado && typeof analisado === 'object' ? analisado : {}
    } catch {
        return {}
    }
}

function motivoDoPedido(req) {
    const motivo = String(corpoDoPedido(req).motivo ?? '').trim()
    return motivo ? motivo.slice(0, 500) : null
}

/** Cria um handler Vercel (Node) para uma RPC de decisão do HITL. */
export function criarHandlerDecisao({ rpc, mensagemErro }) {
    return async function handlerDecisao(req, res) {
        if (req.method === 'OPTIONS') {
            res.statusCode = 204
            res.end()
            return
        }

        if (req.method !== 'POST') {
            responder(res, 405, {
                error: { code: 'METODO_INVALIDO', message: 'Use POST.' }
            })
            return
        }

        const token = tokenDoPedido(req)
        if (!token) {
            responder(res, 401, {
                error: { code: 'NAO_AUTENTICADO', message: 'Faça login para revisar provas.' }
            })
            return
        }

        const provaId = idDoPedido(req)
        if (!UUID.test(provaId)) {
            responder(res, 400, {
                error: { code: 'ID_INVALIDO', message: 'Prova inválida.' }
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
                `${url.replace(/\/$/, '')}/rest/v1/rpc/${rpc}`,
                {
                    method: 'POST',
                    headers: {
                        apikey: anonKey,
                        authorization: `Bearer ${token}`,
                        'content-type': 'application/json',
                        accept: 'application/json'
                    },
                    body: JSON.stringify({ p_prova_id: provaId, p_motivo: motivoDoPedido(req) }),
                    cache: 'no-store'
                }
            )

            if (!resposta.ok) {
                const status = [400, 401, 403].includes(resposta.status) ? resposta.status : 502
                responder(res, status, {
                    error: {
                        code: status === 403 ? 'SEM_PERMISSAO' : 'DECISAO_INDISPONIVEL',
                        message: status === 403
                            ? 'Somente administradores e professores podem revisar esta prova.'
                            : mensagemErro
                    }
                })
                return
            }

            const dados = await resposta.json()
            const aprovado = Boolean(dados?.publicado)
            responder(res, 200, {
                ok: true,
                prova_id: provaId,
                ...(rpc === 'sulsafe_aprovar_prova_ia'
                    ? { publicado: aprovado }
                    : { rejeitada: true })
            })
        } catch {
            responder(res, 502, {
                error: { code: 'DECISAO_INDISPONIVEL', message: mensagemErro }
            })
        }
    }
}
