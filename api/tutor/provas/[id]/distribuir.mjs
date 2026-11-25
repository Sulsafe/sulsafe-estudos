// ============================================================
// POST /api/tutor/provas/:id/distribuir — ETAPA 5/8
// ============================================================
// JWT do chamador + chave ANÔNIMA. A RPC valida papel, empresa, estado da
// prova e o destino. service_role nunca aparece aqui.
// ============================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DESTINOS = new Set(['TURMA', 'ALUNO', 'CATALOGO', 'INTERNO'])

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
        const trecho = caminho.match(/\/api\/tutor\/provas\/([^/]+)\/distribuir/i)
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

export default async function handlerDistribuir(req, res) {
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
            error: { code: 'NAO_AUTENTICADO', message: 'Faça login para distribuir provas.' }
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

    const corpo = corpoDoPedido(req)
    const destinoTipo = String(corpo.destino_tipo ?? '').trim().toUpperCase()
    if (!DESTINOS.has(destinoTipo)) {
        responder(res, 400, {
            error: { code: 'DESTINO_INVALIDO', message: 'Escolha TURMA, ALUNO, CATALOGO ou INTERNO.' }
        })
        return
    }

    let destinoId = null
    if (destinoTipo === 'TURMA' || destinoTipo === 'ALUNO') {
        destinoId = String(corpo.destino_id ?? '').trim()
        if (!UUID.test(destinoId)) {
            responder(res, 400, {
                error: { code: 'DESTINO_INVALIDO', message: `Informe uma ${destinoTipo === 'TURMA' ? 'turma' : 'aluno'} válida.` }
            })
            return
        }
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
            `${url.replace(/\/$/, '')}/rest/v1/rpc/sulsafe_distribuir_prova_ia`,
            {
                method: 'POST',
                headers: {
                    apikey: anonKey,
                    authorization: `Bearer ${token}`,
                    'content-type': 'application/json',
                    accept: 'application/json'
                },
                body: JSON.stringify({
                    p_prova_id: provaId,
                    p_destino_tipo: destinoTipo,
                    p_destino_id: destinoId
                }),
                cache: 'no-store'
            }
        )

        if (!resposta.ok) {
            const status = [400, 401, 403].includes(resposta.status) ? resposta.status : 502
            responder(res, status, {
                error: {
                    code: status === 403 ? 'SEM_PERMISSAO' : 'DISTRIBUICAO_INDISPONIVEL',
                    message: status === 403
                        ? 'Somente administradores e professores podem distribuir esta prova.'
                        : 'Não foi possível distribuir a prova. Verifique o destino e a aprovação.'
                }
            })
            return
        }

        const dados = await resposta.json()
        responder(res, 200, {
            ok: true,
            prova_id: provaId,
            destino_tipo: String(dados?.destino_tipo || destinoTipo),
            quantidade_alunos: Number(dados?.quantidade_alunos || 0),
            distribuido_em: dados?.distribuido_em ?? null
        })
    } catch {
        responder(res, 502, {
            error: { code: 'DISTRIBUICAO_INDISPONIVEL', message: 'Não foi possível distribuir a prova.' }
        })
    }
}
