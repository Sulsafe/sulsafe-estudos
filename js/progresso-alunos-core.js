// ============================================================
// PROGRESSO DOS ALUNOS — REGRAS DE APRESENTAÇÃO (FASE 5.3)
// ============================================================
// Funções puras compartilhadas pela tela do professor. Os textos de status
// são padronizados para evitar que cada view interprete a RPC de outro jeito.
// ============================================================

export const STATUS_PROVAS = Object.freeze({
    LIBERADA: 'NOTA LIBERADA',
    AGUARDANDO: 'AGUARDANDO REVISÃO',
    PENDENTE: 'PENDENTE',
    SEM_PROVA: 'SEM PROVA'
})

const ROTULOS_STATUS = Object.freeze({
    [STATUS_PROVAS.LIBERADA]: STATUS_PROVAS.LIBERADA,
    [STATUS_PROVAS.AGUARDANDO]: STATUS_PROVAS.AGUARDANDO,
    [STATUS_PROVAS.PENDENTE]: STATUS_PROVAS.PENDENTE,
    [STATUS_PROVAS.SEM_PROVA]: STATUS_PROVAS.SEM_PROVA,
    CONCLUIDA: STATUS_PROVAS.AGUARDANDO,
    EM_ANDAMENTO: STATUS_PROVAS.AGUARDANDO
})

/** Converte a lista_pipe da RPC em rótulos legíveis, sem repetição. */
export function normalizarStatusProvas(valor) {
    if (!valor) return STATUS_PROVAS.SEM_PROVA

    const partes = String(valor)
        .split('|')
        .map(parte => parte.trim().toUpperCase())
        .filter(Boolean)

    if (partes.length === 0) return STATUS_PROVAS.SEM_PROVA

    const rotulos = []
    for (const parte of partes) {
        const rotulo = ROTULOS_STATUS[parte] || parte
        if (!rotulos.includes(rotulo)) rotulos.push(rotulo)
    }
    return rotulos.join(' | ')
}

/** Classe de badge SulSafe correspondente ao status agregado. */
export function classeStatusProvas(valor) {
    const texto = normalizarStatusProvas(valor)
    if (texto.includes(STATUS_PROVAS.LIBERADA)) return 'badge bg-ok'
    if (texto.includes(STATUS_PROVAS.AGUARDANDO)) return 'badge bg-pendente'
    return 'badge'
}

/** Progresso vindo de view_ranking_alunos limitado a 0–100. */
export function progressoPercentual(valor) {
    const numero = Number(valor)
    if (!Number.isFinite(numero)) return 0
    return Math.max(0, Math.min(100, Math.round(numero)))
}

export function formatarProgresso(valor) {
    return `${progressoPercentual(valor)}%`
}

/** Último acesso de auth.users.last_sign_in_at em pt-BR. */
export function formatarUltimoAcesso(valor) {
    if (!valor) return '—'
    const data = new Date(valor)
    if (Number.isNaN(data.getTime())) return '—'
    try {
        return new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short'
        }).format(data)
    } catch {
        return data.toLocaleString('pt-BR')
    }
}

/** Filtro local de apoio (a RPC já filtra no servidor por empresa/escopo). */
export function filtrarProgresso(linhas, { turmaId = null, alunoId = null } = {}) {
    const itens = Array.isArray(linhas) ? linhas : []
    return itens.filter(linha =>
        (!turmaId || linha.turma_id === turmaId) &&
        (!alunoId || linha.aluno_id === alunoId)
    )
}

/** Opções únicas para os filtros, derivadas da própria listagem. */
export function opcoesFiltro(linhas) {
    const itens = Array.isArray(linhas) ? linhas : []
    const turmas = new Map()
    const alunos = new Map()

    for (const linha of itens) {
        if (linha.turma_id && linha.turma_nome) {
            turmas.set(linha.turma_id, linha.turma_nome)
        }
        if (linha.aluno_id) {
            alunos.set(linha.aluno_id, linha.nome_completo || linha.email || 'Aluno')
        }
    }

    return {
        turmas: Array.from(turmas, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
        alunos: Array.from(alunos, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
    }
}
