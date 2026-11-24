// ============================================================
// PROFESSOR I.A (IA 2) — CONFIGURAÇÃO PLUGÁVEL / BYOA
// ============================================================
// Apenas ESTRUTURA. A geração de cursos NÃO está implementada aqui.
// Módulo puro (sem import, sem DOM, sem fetch): pode ser testado no Node.
// Regra de negócio:
//  - Secretária (IA 1) = grátis e sempre inclusa.
//  - Professor I.A com API da SulSafe = cobrado à parte, valor negociado
//    caso a caso. Sem preço fixo e sem Mercado Pago.
//  - Professor I.A com API própria = a empresa paga a API dela.
//  - A chave NUNCA fica no navegador: vai direto ao Supabase Vault via RPC.

export const PROVEDORES_IA_PROFESSOR = Object.freeze({
    DESATIVADO: 'desativado',
    SULSAFE: 'sulsafe_api',
    OPENAI: 'openai',
    GEMINI: 'gemini',
    ANTHROPIC: 'anthropic',
    CUSTOM: 'custom'
})

export const CONFIG_IA_PROFESSOR_PADRAO = Object.freeze({
    provedor: PROVEDORES_IA_PROFESSOR.DESATIVADO,
    api_url: '',
    modelo: '',
    ativo: false,
    chave_configurada: false,
    observacao: ''
})

const PROVEDORES_PROPRIOS = new Set([
    PROVEDORES_IA_PROFESSOR.OPENAI,
    PROVEDORES_IA_PROFESSOR.GEMINI,
    PROVEDORES_IA_PROFESSOR.ANTHROPIC,
    PROVEDORES_IA_PROFESSOR.CUSTOM
])

const TODOS_PROVEDORES = new Set([
    PROVEDORES_IA_PROFESSOR.DESATIVADO,
    PROVEDORES_IA_PROFESSOR.SULSAFE,
    ...PROVEDORES_PROPRIOS
])

export function provedorIaEhValido(provedor) {
    return TODOS_PROVEDORES.has(provedor)
}

export function ehProvedorProprio(provedor) {
    return PROVEDORES_PROPRIOS.has(provedor)
}

// Converte o valor do banco para o valor do <select> da tela do admin.
export function modoDoSelect(provedor) {
    if (provedor === PROVEDORES_IA_PROFESSOR.SULSAFE) return 'sulsafe_api'
    if (ehProvedorProprio(provedor)) return 'proprio'
    return 'desativado'
}

// Converte a escolha da tela para o valor gravado no banco.
export function provedorDoModo(modo, provedorProprio) {
    if (modo === 'sulsafe_api') return PROVEDORES_IA_PROFESSOR.SULSAFE
    if (modo === 'proprio' && provedorIaEhValido(provedorProprio) && ehProvedorProprio(provedorProprio)) {
        return provedorProprio
    }
    return PROVEDORES_IA_PROFESSOR.DESATIVADO
}

// Regra central de exibição do botão "Criar com I.A".
// Desativado por padrão: só aparece se houver provedor válido E ativo true.
export function deveMostrarBotaoProfessorIA(config) {
    if (!config || typeof config !== 'object') return false
    if (!provedorIaEhValido(config.provedor)) return false
    if (config.provedor === PROVEDORES_IA_PROFESSOR.DESATIVADO) return false
    if (config.ativo !== true) return false
    if (ehProvedorProprio(config.provedor) && config.chave_configurada === false) return false
    return true
}

// Quais campos aparecem para cada modo.
export function camposVisiveisDoModo(modo) {
    return Object.freeze({
        url: modo === 'proprio',
        chave: modo === 'proprio',
        modelo: modo === 'proprio',
        ativo: modo === 'proprio' || modo === 'sulsafe_api'
    })
}

export function textoOrientacaoDoModo(modo) {
    if (modo === 'sulsafe_api') {
        return 'Para ativar, fale com o suporte e negocie o valor. Cada empresa tem um preço diferente conforme volume.'
    }
    if (modo === 'proprio') {
        return 'Sua empresa paga a API dela: a SulSafe só faz a ponte, sem custo extra além da licença. A chave é enviada uma vez ao Supabase Vault e nunca fica no navegador.'
    }
    return 'Com o Professor I.A desativado, o botão "Criar com I.A" fica oculto da interface.'
}

// Remove tags e normaliza texto vindo de input antes de reexibir na tela.
export function textoSeguro(valor) {
    return String(valor ?? '')
        // Remove blocos perigosos inteiros (inclusive o texto dentro deles).
        .replace(/<\s*(?:script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\s*\/\s*(?:script|style|iframe|object|embed)\s*>/gi, '')
        // Remove tags restantes e qualquer resíduo de colchetes.
        .replace(/<[^>]*>/g, '')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500)
}

export function normalizarConfigIAProfessor(config) {
    const cfg = config || {}
    const provedor = provedorIaEhValido(cfg.provedor)
        ? cfg.provedor
        : PROVEDORES_IA_PROFESSOR.DESATIVADO

    return Object.freeze({
        provedor,
        api_url: textoSeguro(cfg.api_url),
        modelo: textoSeguro(cfg.modelo),
        ativo: cfg.ativo === true || cfg.ativo === 'true',
        chave_configurada: cfg.chave_configurada === true,
        observacao: textoSeguro(cfg.observacao)
    })
}

// Payload da RPC. A chave aparece só aqui, enviada uma vez por HTTPS,
// e nunca é gravada em nenhum armazenamento do navegador nem devolvida ao front.
export function payloadConfigIAProfessor(config, chaveBruta) {
    const cfg = normalizarConfigIAProfessor(config)
    const chave = typeof chaveBruta === 'string' ? chaveBruta.trim() : ''

    return Object.freeze({
        p_provedor: cfg.provedor,
        p_api_url: cfg.api_url || null,
        p_modelo: cfg.modelo || null,
        p_ativo: cfg.ativo,
        p_api_key: chave || null,
        p_observacao: cfg.observacao || null
    })
}
