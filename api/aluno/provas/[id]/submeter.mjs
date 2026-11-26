// ============================================================
// POST /api/aluno/provas/:id/submeter — ETAPA 6/8
// ============================================================
// JWT do aluno + chave ANÔNIMA. A RPC valida entrega/empresa, corrige pelo
// gabarito internamente e grava nota/status. service_role nunca aparece aqui.
// ============================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALTERNATIVAS = new Set(['A', 'B', 'C', 'D', 'E'])

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
        const trecho = caminho.match(/\/api\/aluno\/provas\/([^/]+)\/submeter/i)
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

function respostasDoPedido(req) {
    const bruto = corpoDoPedido(req).respostas
    if (!Array.isArray(bruto) || bruto.length === 0) return null

    const respostas = []
    for (const item of bruto) {
        if (!item || typeof item !== 'object') return null
        const questaoId = String(item.questao_id ?? '').trim()
        if (!UUID.test(questaoId)) return null

        // Questão discursiva (Etapa 7): texto livre, limitado como no banco.
        const textoBruto = item.texto_resposta
        if (textoBruto !== undefined && textoBruto !== null) {
            const texto = String(textoBruto).trim()
            if (!texto || texto.length > 4000) return null
            respostas.push({ questao_id: questaoId, texto_resposta: texto })
            continue
        }

        const alternativa = String(item.alternativa ?? '').trim().toUpperCase()
        if (!ALTERNATIVAS.has(alternativa)) return null
        respostas.push({ questao_id: questaoId, alternativa })
    }
    return respostas
}

function clienteFetch(token) {
    return {
        async rpc(nome, argumentos) {
            const url = process.env.SUPABASE_URL
            const anonKey = process.env.SUPABASE_ANON_KEY
            if (!url || !anonKey) {
                return { data: null, error: { message: 'API de conteúdo não configurada.' }, config: false }
            }

            const resposta = await fetch(
                `${url.replace(/\/$/, '')}/rest/v1/rpc/${nome}`,
                {
                    method: 'POST',
                    headers: {
                        apikey: anonKey,
                        authorization: `Bearer ${token}`,
                        'content-type': 'application/json',
                        accept: 'application/json'
                    },
                    body: JSON.stringify(argumentos),
                    cache: 'no-store'
                }
            )

            if (!resposta.ok) {
                let mensagem = 'Não foi possível finalizar a prova.'
                try {
                    const corpo = await resposta.json()
                    mensagem = corpo?.message || corpo?.error?.message || mensagem
                } catch {
                    // mantém mensagem genérica
                }
                return { data: null, error: { message: mensagem }, status: resposta.status }
            }

            return { data: await resposta.json(), error: null }
        }
    }
}

function statusDoErro(mensagem, statusHttp) {
    if ([401, 403].includes(statusHttp) || /Somente alunos|sem permissão|não autorizado/i.test(mensagem)) return 403
    if (/inválid|não pertence|inexistente|responda|informe|duplic/i.test(mensagem)) return 400
    if (/configurada/i.test(mensagem)) return 500
    return 502
}

export default async function handlerSubmeter(req, res, clienteInjetado = null) {
    if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
    }

    if (req.method !== 'POST') {
        responder(res, 405, { error: { code: 'METODO_INVALIDO', message: 'Use POST.' } })
        return
    }

    const token = tokenDoPedido(req)
    if (!token) {
        responder(res, 401, { error: { code: 'NAO_AUTENTICADO', message: 'Faça login para finalizar a prova.' } })
        return
    }

    const provaId = idDoPedido(req)
    if (!UUID.test(provaId)) {
        responder(res, 400, { error: { code: 'ID_INVALIDO', message: 'Prova inválida.' } })
        return
    }

    const respostas = respostasDoPedido(req)
    if (!respostas) {
        responder(res, 400, {
            error: { code: 'RESPOSTAS_INVALIDAS', message: 'Informe uma alternativa ou resposta discursiva válida para cada questão.' }
        })
        return
    }

    const cliente = clienteInjetado || clienteFetch(token)

    try {
        const { data, error } = await cliente.rpc('sulsafe_submeter_prova_aluno_ia', {
            p_prova_id: provaId,
            p_respostas: respostas
        })

        if (error) {
            const mensagem = String(error.message || '')
            const status = statusDoErro(mensagem, error.status)
            responder(res, status, {
                error: {
                    code: status === 403 ? 'SEM_PERMISSAO' : status === 400 ? 'RESPOSTAS_INVALIDAS' : 'CORRECAO_INDISPONIVEL',
                    message: status === 400 || status === 403
                        ? mensagem
                        : 'Não foi possível finalizar a prova. Tente novamente.'
                }
            })
            return
        }

        // A nota calculada pela I.A. fica no banco para revisão do professor.
        // O aluno recebe apenas a confirmação de envio, sem nota nem acertos.
        responder(res, 200, {
            ok: true,
            prova_id: provaId,
            nota: null,
            liberado: false,
            total: Number(data?.total ?? 0),
            quantidade_questoes: Number(data?.quantidade_questoes ?? 0),
            status: String(data?.status || 'CONCLUIDA'),
            mensagem: String(data?.mensagem || 'Prova enviada! Aguarde a revisão do professor para ver sua nota.')
        })
    } catch {
        responder(res, 502, {
            error: { code: 'CORRECAO_INDISPONIVEL', message: 'Não foi possível finalizar a prova. Tente novamente.' }
        })
    }
}
