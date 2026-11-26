// ============================================================
// VIEW: PROGRESSO DOS ALUNOS (FASES 5.3 + 5.4)
// ============================================================
// Painel do professor/admin com:
//   * progresso em videoaulas (view_ranking_alunos via RPC),
//   * status agregado das provas I.A. (aguardando revisão / nota liberada),
//   * último acesso (auth.users.last_sign_in_at),
//   * filtros por turma e por aluno aplicados no servidor,
//   * emissão de certificado (Fase 5.4) somente para alunos aptos.
// As RPCs são SECURITY DEFINER e devolvem somente alunos da empresa do professor.
// ============================================================

import { isAdmin, isProf, nav, S } from '../state.js'
import {
    sbEmitirCertificadoRPC,
    sbListarElegibilidadeCertificados,
    sbListarProgressoAlunos
} from '../supabase-client.js'
import { $, handleError, sanitizar, toast } from '../utils.js'
import {
    classeStatusProvas,
    filtrarProgresso,
    formatarProgresso,
    formatarUltimoAcesso,
    normalizarStatusProvas,
    opcoesFiltro,
    progressoPercentual
} from '../progresso-alunos-core.js'

let linhasCache = []
let elegibilidadeCache = new Map()

export function vProgressoAlunos() {
    if (!isAdmin() && !isProf()) return nav('inicio')

    return `
        <div class="btn-back" onclick="window.nav('professor')">
            <i class="fas fa-arrow-left"></i> Voltar para a Área do Professor
        </div>
        <div class="god-hd">
            <h2><i class="fas fa-chart-line"></i> Progresso dos Alunos</h2>
            <p>Acompanhe videoaulas, provas e último acesso — ${sanitizar(S.user?.nome_completo || S.user?.email || '')}</p>
        </div>
        <div class="pnl">
            <div class="pnl-h">
                <div class="pnl-t"><i class="fas fa-filter"></i> Filtros</div>
                <button class="btn" type="button" id="limparFiltrosProgresso">
                    <i class="fas fa-eraser"></i> Limpar filtros
                </button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
                <label style="font-size:13px">
                    Turma
                    <select id="filtroTurmaProgresso" style="display:block;width:100%;margin-top:4px;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:8px;color:var(--tx)">
                        <option value="">Todas as turmas</option>
                    </select>
                </label>
                <label style="font-size:13px">
                    Aluno
                    <select id="filtroAlunoProgresso" style="display:block;width:100%;margin-top:4px;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:8px;color:var(--tx)">
                        <option value="">Todos os alunos</option>
                    </select>
                </label>
            </div>
        </div>
        <div class="pnl">
            <div class="pnl-h">
                <div class="pnl-t"><i class="fas fa-users"></i> Alunos</div>
            </div>
            <div id="tabelaProgressoAlunos" aria-live="polite" aria-busy="true">
                <div class="empty" role="status"><i class="fas fa-spinner fa-spin"></i><p>Carregando progresso...</p></div>
            </div>
        </div>
    `
}

export function iniciarProgressoAlunos() {
    if (!isAdmin() && !isProf()) return nav('inicio')

    const container = $('#tabelaProgressoAlunos')
    if (!container) return

    const turma = $('#filtroTurmaProgresso')
    const aluno = $('#filtroAlunoProgresso')
    const limpar = $('#limparFiltrosProgresso')

    turma?.addEventListener('change', () => carregar(false))
    aluno?.addEventListener('change', () => carregar(false))
    limpar?.addEventListener('click', () => {
        if (turma) turma.value = ''
        if (aluno) aluno.value = ''
        carregar(false)
    })

    carregar(true)
}

async function carregar(popularFiltros) {
    const container = $('#tabelaProgressoAlunos')
    if (!container) return

    const turmaId = $('#filtroTurmaProgresso')?.value || null
    const alunoId = $('#filtroAlunoProgresso')?.value || null

    container.setAttribute('aria-busy', 'true')
    const { data, error } = await sbListarProgressoAlunos(turmaId, alunoId)
    if (!container.isConnected) return
    container.setAttribute('aria-busy', 'false')

    if (error) {
        handleError(error)
        container.innerHTML = `
            <div class="empty" role="alert">
                <i class="fas fa-triangle-exclamation"></i>
                <p>${sanitizar(error.message || 'Não foi possível carregar o progresso dos alunos.')}</p>
            </div>
        `
        return
    }

    linhasCache = Array.isArray(data) ? data : []

    // A elegibilidade é carregada à parte: se falhar, o painel de progresso
    // continua utilizável e a RPC de emissão ainda valida no servidor.
    const eleg = await sbListarElegibilidadeCertificados()
    if (!container.isConnected) return
    if (eleg.error) {
        console.warn('Elegibilidade de certificados indisponível:', eleg.error)
    }
    elegibilidadeCache = new Map(
        (eleg.data || []).map(item => [`${item.aluno_id}:${item.nr_id}`, item])
    )

    if (popularFiltros) preencherFiltros(linhasCache)
    renderTabela(linhasCache)
}

function preencherFiltros(linhas) {
    const { turmas, alunos } = opcoesFiltro(linhas)
    const turma = $('#filtroTurmaProgresso')
    const aluno = $('#filtroAlunoProgresso')

    if (turma) {
        const atual = turma.value
        turma.innerHTML = `
            <option value="">Todas as turmas</option>
            ${turmas.map(item => `<option value="${sanitizar(item.id)}">${sanitizar(item.nome)}</option>`).join('')}
        `
        turma.value = atual
    }

    if (aluno) {
        const atual = aluno.value
        aluno.innerHTML = `
            <option value="">Todos os alunos</option>
            ${alunos.map(item => `<option value="${sanitizar(item.id)}">${sanitizar(item.nome)}</option>`).join('')}
        `
        aluno.value = atual
    }
}

function renderTabela(linhas) {
    const container = $('#tabelaProgressoAlunos')
    if (!container) return

    // Defesa em profundidade: a RPC já aplica filtros e isolamento por empresa.
    const itens = filtrarProgresso(linhas, {
        turmaId: $('#filtroTurmaProgresso')?.value || null,
        alunoId: $('#filtroAlunoProgresso')?.value || null
    })

    if (itens.length === 0) {
        container.innerHTML = `
            <div class="empty" role="status">
                <i class="fas fa-inbox"></i>
                <p>Nenhum aluno encontrado para este filtro.</p>
            </div>
        `
        return
    }

    const linhasHTML = itens.map(item => {
        const nome = sanitizar(item.nome_completo || item.email || 'Aluno')
        const turma = sanitizar(item.turma_nome || '—')
        const percentual = progressoPercentual(item.progresso)
        const aulas = sanitizar(String(item.aulas_concluidas ?? 0))
        const status = normalizarStatusProvas(item.status_provas)
        const classe = classeStatusProvas(status)
        const ultimoAcesso = sanitizar(formatarUltimoAcesso(item.ultimo_acesso))
        const alunoId = sanitizar(String(item.aluno_id ?? item.id ?? ''))

        // Fase 5.4: só habilita emissão quando a RPC marcou apto e ainda não
        // existe certificado ativo para o par aluno/NR.
        const doAluno = [...elegibilidadeCache.values()].filter(
            eleg => String(eleg.aluno_id) === String(item.aluno_id ?? item.id)
        )
        const emitidos = doAluno.filter(eleg => eleg.certificado_id && !eleg.revogado)
        const aptos = doAluno.filter(eleg => eleg.apto === true && !eleg.certificado_id)
        let celulaCertificado = '<span class="badge">Sem NR apto</span>'

        if (emitidos.length > 0) {
            const nrs = emitidos.map(eleg => `NR-${String(eleg.nr_id).padStart(2, '0')}`).join(', ')
            celulaCertificado = `
                <span class="badge bg-ok">Emitido: ${sanitizar(nrs)}</span>
                <button type="button" class="btn btn-sm" onclick="window.nav('certificados')">
                    <i class="fas fa-eye"></i> Ver
                </button>
            `
        } else if (aptos.length > 0) {
            const opcoes = aptos.map(eleg => `
                <option value="${sanitizar(String(eleg.nr_id))}">
                    NR-${sanitizar(String(eleg.nr_id).padStart(2, '0'))} · nota ${sanitizar(String(eleg.nota ?? ''))}
                </option>
            `).join('')
            celulaCertificado = `
                <select id="certNr_${alunoId}" aria-label="NR do certificado de ${nome}" style="max-width:150px;padding:4px">
                    ${opcoes}
                </select>
                <button type="button" class="btn btn-sm btn-p" data-emitir-aluno="${alunoId}"
                    onclick="window.emitirCertificadoProgresso('${alunoId}', document.getElementById('certNr_${alunoId}').value)">
                    <i class="fas fa-award"></i> Emitir Certificado
                </button>
            `
        }

        return `
            <tr>
                <td>${nome}</td>
                <td>${turma}</td>
                <td>${aulas}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:8px;min-width:150px">
                        <progress value="${percentual}" max="100" aria-label="Progresso de ${nome}"></progress>
                        <span>${sanitizar(formatarProgresso(percentual))}</span>
                    </div>
                </td>
                <td><span class="${classe}">${sanitizar(status)}</span></td>
                <td>${ultimoAcesso}</td>
                <td style="min-width:220px">${celulaCertificado}</td>
            </tr>
        `
    }).join('')

    container.innerHTML = `
        <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:13px"
                aria-label="Progresso dos alunos com filtros aplicados">
                <thead>
                    <tr>
                        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">Aluno</th>
                        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">Turma</th>
                        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">Aulas</th>
                        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">Progresso</th>
                        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">Provas</th>
                        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">Último acesso</th>
                        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">Certificado</th>
                    </tr>
                </thead>
                <tbody>${linhasHTML}</tbody>
            </table>
        </div>
    `
}

// A RPC é a única via de emissão; aqui só coletamos os dados da linha.
window.emitirCertificadoProgresso = async function (alunoId, nrId) {
    if (!alunoId || !nrId) {
        toast('Selecione o NR do certificado.', 'err')
        return
    }

    try {
        const { data, error } = await sbEmitirCertificadoRPC({ alunoId, nrId })
        if (error) throw error

        toast(
            data?.ja_existia
                ? 'Certificado já emitido para este NR.'
                : `Certificado ${String(nrId).padStart(2, '0')} emitido com sucesso!`,
            'success'
        )
        await carregar(false)
    } catch (error) {
        console.error('Erro ao emitir certificado:', error)
        handleError(error)
    }
}
