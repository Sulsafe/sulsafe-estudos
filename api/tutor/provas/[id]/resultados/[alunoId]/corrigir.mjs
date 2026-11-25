// ============================================================
// POST /api/tutor/provas/:id/resultados/:alunoId/corrigir — ETAPA 7/8
// ============================================================
// Correção manual de questão discursiva. JWT do professor + chave ANÔNIMA;
// a RPC valida empresa, papel, tipo da questão e limites da nota.
// ============================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CAMPOS_PERMITIDOS = Object.freeze(['nota', 'status', 'questao_id', 'nota_manual'])

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
            .match(/\/api\/tutor\/provas\/([^/]+)\/resultados\/([^/]+)\/corrigir/i)
        return trecho
            ? { provaId: decodeURIComponent(trecho[1]), alunoId: decodeURIComponent(trecho[2]) }
            : { provaId: '', alunoId: '' }
    } catch {
        return { provaId: '', alunoId: '' }
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

export default async function handler(req, res) {
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
        responder(res, 401, {
            error: { code: 'NAO_AUTENTICADO', message: 'Faça login para corrigir a prova.' }
        })
        return
    }

    const { provaId, alunoId } = idsDoPedido(req)
    if (!UUID.test(provaId) || !UUID.test(alunoId)) {
        responder(res, 400, { error: { code: 'ID_INVALIDO', message: 'Prova ou aluno inválido.' } })
        return
    }

    const corpo = corpoDoPedido(req)
    const questaoId = String(corpo.questao_id ?? '').trim()
    const nota = Number(corpo.nota)
    if (!UUID.test(questaoId) || !Number.isFinite(nota) || nota < 0 || nota > 10) {
        responder(res, 400, {
            error: { code: 'NOTA_INVALIDA', message: 'Informe uma questão e uma nota entre 0 e 10.' }
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
            `${url.replace(/\/$/, '')}/rest/v1/rpc/sulsafe_corrigir_resposta_discursiva_ia`,
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
                    p_aluno_id: alunoId,
                    p_questao_id: questaoId,
                    p_nota: nota
                }),
                cache: 'no-store'
            }
        )

        if (!resposta.ok) {
            let mensagem = 'Não foi possível registrar a nota.'
            try {
                const erro = await resposta.json()
                mensagem = erro?.message || erro?.error?.message || mensagem
            } catch {
                // mantém mensagem genérica
            }
            const status = resposta.status === 401 || resposta.status === 403
                ? resposta.status
                : resposta.status === 400 ? 400 : 502
            responder(res, status, {
                error: {
                    code: status === 403 ? 'SEM_PERMISSAO' : status === 400 ? 'NOTA_INVALIDA' : 'CORRECAO_INDISPONIVEL',
                    message: status === 502 ? 'Não foi possível registrar a nota. Tente novamente.' : mensagem
                }
            })
            return
        }

        const bruto = await resposta.json()
        const resultado = Object.fromEntries(
            CAMPOS_PERMITIDOS
                .filter(campo => Object.prototype.hasOwnProperty.call(bruto || {}, campo))
                .map(campo => [campo, bruto[campo]])
        )

        responder(res, 200, { ok: true, ...resultado })
    } catch {
        responder(res, 502, {
            error: {
                code: 'CORRECAO_INDISPONIVEL',
                message: 'Não foi possível registrar a nota. Tente novamente.'
            }
        })
    }
}
