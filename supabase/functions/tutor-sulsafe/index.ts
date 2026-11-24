// ============================================================
// SUPABASE EDGE FUNCTION — TUTOR-SULSAFE (FASE 2)
// ============================================================
// Worker da fila de geração. O navegador NEVER recebe a chave de API:
// ela é lida do Vault pela RPC sulsafe_obter_config_ia_worker().
//
// Fluxo (espelha o passo 3C homologado na MR):
//   1. recebe { job_id } + o JWT do chamador no header Authorization
//   2. valida a permissão do chamador sobre o job (RPC com o JWT, não service_role)
//   3. lê o job (prompt já montado pelo front com montarPromptTutor)
//   4. status PENDENTE -> PROCESSANDO
//   5. chama o provedor configurado (OpenMAIC / OpenAI / Gemini / Anthropic)
//   6. converte o formato nativo para o contrato pt-BR
//   7. grava em ia_conteudos via sulsafe_salvar_ia_conteudo (service_role)
//   8. status -> CONCLUIDO (ou ERRO, com mensagem em pt-BR)
//
// Modo stub: TUTOR_SULSAFE_STUB=1 gera uma ementa determinística sem API,
// permitindo homologar o fluxo completo sem chave e sem deploy.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0'
import { extrairJson } from './extrair-json.js'

const JSON_HEADERS = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS'
}

type ConfigIA = {
    provedor: string
    api_url: string | null
    modelo: string | null
    ativo: boolean
    api_key: string
}

type Job = {
    id: string
    tipo: string
    titulo: string
    prompt: string
    status: string
    criado_por: string
}

type ContratoTutor = {
    titulo: string
    descricao: string
    publicoAlvo: string
    objetivos: string[]
    modulos: Array<{
        titulo: string
        descricao: string
        aulas: Array<{ titulo: string; descricao: string }>
    }>
}

type ErroProvedor = Error & { status?: number }

function resposta(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function textoOu(valor: unknown, fallback = ''): string {
    return typeof valor === 'string' && valor.trim() ? valor.trim() : fallback
}

function dedup(textos: string[], limite: number): string[] {
    const vistos = new Set<string>()
    const saida: string[] = []
    for (const texto of textos) {
        const limpo = textoOu(texto)
        if (!limpo || vistos.has(limpo.toLowerCase())) continue
        vistos.add(limpo.toLowerCase())
        saida.push(limpo)
        if (saida.length >= limite) break
    }
    return saida
}

function cortar(texto: string, limite: number): string {
    return texto.length > limite ? `${texto.slice(0, limite - 1).trimEnd()}…` : texto
}

/** Converte o formato nativo do OpenMAIC para o contrato pt-BR da SulSafe. */
export function adaptarSaida(outline: any, assunto: string): ContratoTutor {
    const bruto = outline && typeof outline === 'object' ? outline : {}
    const cenas = Array.isArray(bruto.outlines) ? bruto.outlines : []

    const utilizaveis = cenas
        .filter((cena: any) => cena && typeof cena === 'object' && textoOu(cena.title))
        .slice(0, 50)
        .map((cena: any, indice: number) => ({
            ...cena,
            order: Number.isInteger(cena.order) && cena.order >= 0 ? cena.order : indice
        }))
        .sort((a: any, b: any) => a.order - b.order)

    const titulo = cortar(
        textoOu(bruto.courseTitle) || textoOu(utilizaveis[0]?.title) || `Curso de ${cortar(assunto, 60)}`,
        160
    )
    const diretriz = textoOu(bruto.languageDirective)
    const descricao = cortar(
        dedup([diretriz, ...utilizaveis.map((c: any) => textoOu(c.description))], 20).join(' ') || titulo,
        4000
    )
    const objetivos = dedup([
        ...utilizaveis.map((c: any) => textoOu(c.teachingObjective)),
        ...utilizaveis.flatMap((c: any) => Array.isArray(c.keyPoints) ? c.keyPoints.map((p: unknown) => textoOu(p)) : [])
    ], 20)
    const listaObjetivos = objetivos.length ? objetivos : [cortar(descricao, 4000)]

    const modulos = utilizaveis.map((cena: any) => {
        const tituloModulo = cortar(textoOu(cena.title), 160)
        const partes = dedup([
            textoOu(cena.description),
            ...(Array.isArray(cena.keyPoints) ? cena.keyPoints.map((p: unknown) => textoOu(p)) : []),
            textoOu(cena.teachingObjective)
        ].filter(p => p && p.toLowerCase() !== tituloModulo.toLowerCase()), 5)

        return {
            titulo: tituloModulo,
            descricao: cortar(textoOu(cena.teachingObjective) || textoOu(cena.description) || tituloModulo, 4000),
            aulas: [{
                titulo: tituloModulo,
                descricao: cortar(partes.join(' ') || tituloModulo, 20000)
            }]
        }
    })

    if (!modulos.length) {
        modulos.push({ titulo, descricao, aulas: [{ titulo, descricao }] })
    }

    return {
        titulo,
        descricao,
        publicoAlvo: cortar(listaObjetivos[0] || diretriz || titulo, 4000),
        objetivos: listaObjetivos,
        modulos
    }
}

function extrairTextoDaResposta(dados: any): string {
    if (typeof dados?.choices?.[0]?.message?.content === 'string') return dados.choices[0].message.content
    if (typeof dados?.candidates?.[0]?.content?.parts?.[0]?.text === 'string') return dados.candidates[0].content.parts[0].text
    if (typeof dados?.content?.[0]?.text === 'string') return dados.content[0].text
    if (typeof dados?.outline === 'object') return JSON.stringify(dados.outline)
    if (typeof dados === 'string') return dados
    throw new Error('Formato de resposta do provedor não reconhecido')
}

/** Extrai o outline nativo de respostas compatíveis com OpenAI/Gemini/Anthropic. */
export function extrairOutline(dados: any): any {
    const conteudo = extrairTextoDaResposta(dados)
    const json = extrairJson(conteudo)

    // Resposta nativa do OpenMAIC: { success, run: { outline } }.
    if (json?.run?.outline) return json.run.outline
    if (json?.outline?.outlines) return json.outline
    if (json?.outlines) return json
    return json
}

/** Ementa determinística usada apenas no modo stub (sem chave, sem rede). */
export function gerarStub(prompt: string): any {
    const assunto = prompt.split('Pedido do instrutor:').pop()?.trim() || prompt.slice(0, 80)
    const titulo = cortar(assunto.replace(/^(crie|monte|gere|faça|quero)\s+(um|uma|o|a)?\s*/i, ''), 120) || 'Segurança no Trabalho'

    return {
        courseTitle: titulo,
        languageDirective: 'Português do Brasil, linguagem simples e objetiva.',
        outlines: [{
            id: 'c1',
            type: 'slide',
            order: 1,
            title: cortar(titulo, 120),
            description: `Estrutura inicial sobre ${titulo}, gerada localmente para revisão.`,
            keyPoints: ['Contexto e aplicação', 'Requisitos da NR relacionada', 'Boas práticas'],
            teachingObjective: `Compreender os pontos essenciais de ${titulo}.`
        }]
    }
}

async function chamarProvedor(config: ConfigIA, prompt: string): Promise<any> {
    const modelo = config.modelo || 'gpt-4o-mini'
    let url = config.api_url || ''
    let body: Record<string, unknown>

    if (config.provedor === 'gemini') {
        url = `${(config.api_url || 'https://generativelanguage.googleapis.com').replace(/\/$/, '')}/v1beta/models/${encodeURIComponent(modelo)}:generateContent?key=${encodeURIComponent(config.api_key)}`
        body = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
        }
    } else if (config.provedor === 'anthropic') {
        url = `${(config.api_url || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`
        body = {
            model: modelo,
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }]
        }
    } else {
        // openai, custom e sulsafe_api usam o contrato chat/completions.
        url = `${(config.api_url || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`
        body = {
            model: modelo,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: 'Você responde exclusivamente com JSON válido, sem markdown.' },
                { role: 'user', content: prompt }
            ]
        }
    }

    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (config.provedor === 'anthropic') {
        headers['x-api-key'] = config.api_key
        headers['anthropic-version'] = '2023-06-01'
    } else if (config.provedor !== 'gemini') {
        headers.authorization = `Bearer ${config.api_key}`
    }

    const resposta = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
        cache: 'no-store'
    })

    if (!resposta.ok) {
        const detalhe = await resposta.text().catch(() => '')
        const status = resposta.status
        const mensagem = status === 503 || status === 429
            ? 'O provedor de IA está temporariamente indisponível por alta demanda. Tente novamente em instantes.'
            : `Provedor de IA retornou ${status}: ${cortar(detalhe, 200)}`
        const erro = new Error(mensagem) as ErroProvedor
        erro.status = status
        throw erro
    }

    return await resposta.json()
}

/** Retenta apenas falhas transitórias do provedor (429/5xx), com backoff curto. */
export async function chamarProvedorComRetentativa(config: ConfigIA, prompt: string): Promise<any> {
    const tentativas = 3
    let ultimoErro: ErroProvedor | null = null

    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
        try {
            return await chamarProvedor(config, prompt)
        } catch (erro) {
            ultimoErro = erro as ErroProvedor
            const status = Number(ultimoErro?.status) || 0
            const transiente = status === 429 || status >= 500
            if (!transiente || tentativa === tentativas) break
            await new Promise(resolve => setTimeout(resolve, 400 * 2 ** (tentativa - 1)))
        }
    }

    throw ultimoErro || new Error('Falha ao chamar o provedor de IA')
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return resposta({ ok: true })

    if (req.method !== 'POST') {
        return resposta({ error: { code: 'METODO_INVALIDO', message: 'Use POST.' } }, 405)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
        return resposta({ error: { code: 'CONFIGURACAO_AUSENTE', message: 'Edge Function sem credenciais do Supabase.' } }, 500)
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    })

    let jobId = ''

    try {
        const payload = await req.json()
        jobId = textoOu(payload?.job_id)
        if (!jobId) {
            return resposta({ error: { code: 'PAYLOAD_INVALIDO', message: 'Informe job_id.' } }, 400)
        }

        // O service_role grava, mas quem pediu precisa estar autenticado e ter
        // direito sobre este job. A validação roda com o JWT do navegador.
        const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
        if (!token || !anonKey) {
            return resposta({
                error: { code: 'NAO_AUTENTICADO', message: 'Faça login para gerar conteúdo.' }
            }, 401)
        }

        const supabaseUsuario = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false }
        })

        const { data: podeProcessar, error: erroAuth } = await supabaseUsuario.rpc(
            'sulsafe_pode_processar_ia_job',
            { p_job_id: jobId }
        )

        if (erroAuth || podeProcessar !== true) {
            return resposta({
                error: { code: 'SEM_PERMISSAO', message: 'Você não pode gerar conteúdo deste job.' }
            }, 403)
        }

        const { data: job, error: erroJob } = await supabase
            .from('ia_jobs')
            .select('id, tipo, titulo, prompt, status, criado_por')
            .eq('id', jobId)
            .maybeSingle()

        if (erroJob || !job) {
            return resposta({ error: { code: 'JOB_NAO_ENCONTRADO', message: 'Job de I.A. não encontrado.' } }, 404)
        }

        if (job.status !== 'PENDENTE') {
            return resposta({
                error: { code: 'JOB_INVALIDO', message: 'Este job não está aguardando processamento.' }
            }, 409)
        }

        await supabase.rpc('sulsafe_atualizar_status_ia_job', {
            p_job_id: job.id,
            p_status: 'PROCESSANDO'
        })

        let outline: any
        if (Deno.env.get('TUTOR_SULSAFE_STUB') === '1') {
            outline = gerarStub(job.prompt)
        } else {
            const { data: config, error: erroConfig } = await supabase.rpc('sulsafe_obter_config_ia_worker')
            if (erroConfig || !config?.length) throw new Error(erroConfig?.message || 'Professor I.A. não configurado')

            const respostaProvedor = await chamarProvedorComRetentativa(config[0] as ConfigIA, job.prompt)
            outline = extrairOutline(respostaProvedor)
        }

        const contrato = adaptarSaida(outline, job.titulo || job.prompt)
        if (!contrato.titulo || !contrato.modulos.length) {
            throw new Error('O provedor retornou uma ementa vazia')
        }

        const conteudo = {
            versao: 1,
            origem: 'TUTOR_SULSAFE',
            job_id: job.id,
            tipo: job.tipo,
            titulo: contrato.titulo,
            descricao: contrato.descricao,
            publico_alvo: contrato.publicoAlvo,
            objetivos: contrato.objetivos,
            modulos: contrato.modulos
        }

        const { data: conteudoId, error: erroSalvar } = await supabase.rpc('sulsafe_salvar_ia_conteudo', {
            p_job_id: job.id,
            p_tipo: job.tipo,
            p_titulo: contrato.titulo,
            p_conteudo: conteudo
        })

        if (erroSalvar) throw new Error(erroSalvar.message)

        await supabase.rpc('sulsafe_atualizar_status_ia_job', {
            p_job_id: job.id,
            p_status: 'CONCLUIDO',
            p_resultado: contrato as any
        })

        return resposta({
            jobId: job.id,
            jobStatus: 'CONCLUIDO',
            mode: Deno.env.get('TUTOR_SULSAFE_STUB') === '1' ? 'STUB' : 'REAL',
            conteudoId,
            contrato
        }, 201)
    } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : 'Erro inesperado na geração'

        if (jobId) {
            await supabase.rpc('sulsafe_atualizar_status_ia_job', {
                p_job_id: jobId,
                p_status: 'ERRO',
                p_erro_mensagem: cortar(mensagem, 2000)
            }).then(() => undefined, () => undefined)
        }

        return resposta({
            error: { code: 'GERACAO_FALHOU', message: cortar(mensagem, 400) }
        }, 502)
    }
})
