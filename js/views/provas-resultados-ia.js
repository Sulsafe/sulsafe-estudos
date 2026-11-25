// ============================================================
// VIEW: PAINEL DE RESULTADOS DA PROVA (FASE 5, ETAPA 7)
// ============================================================
// Professor/admin acompanha status, nota e data de conclusão de cada aluno,
// abre o detalhe com gabarito e corrige questões discursivas (texto livre).
// Nenhum dado é buscado diretamente de tabela de gabarito: tudo vem das
// rotas /api/tutor/provas/:id/resultados e /resultados/:alunoId.
// ============================================================

import { S, nav, isAdmin, isProf, fmtD } from '../state.js'
import {
    sbListarResultadosProvaIA,
    sbCarregarDetalheResultadoIA,
    sbCorrigirRespostaDiscursivaIA
} from '../supabase-client.js'
import { toast, handleError, openMdl, closeMdl, sanitizar, $ } from '../utils.js'
import { exportarResultadosCSVIA } from '../exportar-resultados-ia.js'

let provaSelecionada = null
let ouvinteTeclado = null
let resultadosCache = []
let apenasPendentes = false

const STATUS_PERMITIDOS = new Set(['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA'])

/** Chamado pelo botão "Ver Resultados" da tela de distribuição. */
export function abrirResultadosProva(provaId) {
    provaSelecionada = provaId || null
    nav('provas-resultados-ia')
}

function provaDaRota() {
    if (provaSelecionada) return provaSelecionada
    try {
        const url = new URL(window.location.href)
        return url.searchParams.get('prova') || ''
    } catch {
        return ''
    }
}

export function vProvasResultadosIA() {
    if (!isAdmin() && !isProf()) return nav('inicio')

    return `
        <div class="btn-back" onclick="window.nav('inicio')">
            <i class="fas fa-arrow-left"></i> Voltar
        </div>
        <div class="god-hd">
            <h2><i class="fas fa-chart-simple"></i> Resultados da Prova</h2>
            <p>Acompanhe o progresso da turma e corrija questões discursivas — ${sanitizar(S.user?.email || '')}</p>
        </div>
        <div class="pnl">
            <div class="pnl-h">
                <div class="pnl-t"><i class="fas fa-table-list"></i> Alunos</div>
                <label style="font-size:13px;display:flex;align-items:center;gap:6px">
                    <input type="checkbox" id="filtroPendentesIA">
                    Apenas Pendentes
                </label>
                <button class="btn" type="button" id="exportarResultadosIA" data-acao="exportar"
                    title="Exporta todos os alunos da prova, sem aplicar o filtro da tela">
                    <i class="fas fa-file-csv"></i> Exportar Resultados
                </button>
            </div>
            <div id="tabelaResultadosIA" aria-live="polite" aria-busy="true">
                <div class="empty" role="status"><i class="fas fa-spinner fa-spin"></i><p>Carregando resultados...</p></div>
            </div>
        </div>
    `
}

export function iniciarProvasResultadosIA() {
    const container = $('#tabelaResultadosIA')
    if (!container) return

    const filtro = $('#filtroPendentesIA')
    if (filtro) {
        filtro.checked = apenasPendentes
        filtro.addEventListener('change', () => {
            apenasPendentes = Boolean(filtro.checked)
            renderTabela()
        })
    }

    const botaoExportar = $('#exportarResultadosIA')
    if (botaoExportar) botaoExportar.addEventListener('click', exportarResultados)

    container.addEventListener('click', (evento) => {
        const detalhe = evento.target.closest('[data-acao="detalhes"]')
        if (detalhe && !detalhe.disabled) {
            abrirDetalhe(detalhe.dataset.aluno, detalhe.dataset.nome)
            return
        }
        const correcao = evento.target.closest('[data-acao="corrigir"]')
        if (correcao && !correcao.disabled) {
            abrirDetalhe(correcao.dataset.aluno, correcao.dataset.nome)
        }
    })

    carregarResultados()
}

async function carregarResultados() {
    const container = $('#tabelaResultadosIA')
    const provaId = provaDaRota()
    if (!container || !provaId) {
        if (container) {
            container.innerHTML = `<div class="empty" role="alert"><i class="fas fa-triangle-exclamation"></i><p>Selecione uma prova distribuída para ver os resultados.</p></div>`
        }
        return
    }

    container.setAttribute('aria-busy', 'true')
    const { data, error } = await sbListarResultadosProvaIA(provaId)
    if (!container.isConnected) return
    container.setAttribute('aria-busy', 'false')

    if (error) {
        container.innerHTML = `<div class="empty" role="alert"><i class="fas fa-triangle-exclamation"></i><p>${sanitizar(error.message || 'Não foi possível carregar os resultados.')}</p></div>`
        return
    }

    resultadosCache = Array.isArray(data) ? data : []
    renderTabela()
}

async function exportarResultados() {
    const botao = $('#exportarResultadosIA')
    const provaId = provaDaRota()
    if (!botao || !provaId) {
        toast('Selecione uma prova distribuída para exportar.', 'err')
        return
    }

    botao.disabled = true
    try {
        const { data, error } = await sbListarResultadosProvaIA(provaId)
        if (error) {
            handleError(error)
            return
        }

        const itens = Array.isArray(data) ? data : []
        if (itens.length === 0) {
            toast('Não há resultados para exportar.', 'info')
            return
        }

        exportarResultadosCSVIA(itens, provaId)
        toast('Arquivo CSV exportado com sucesso.', 'success')
    } finally {
        botao.disabled = false
    }
}

function renderTabela() {
    const container = $('#tabelaResultadosIA')
    if (!container) return

    const itens = apenasPendentes
        ? resultadosCache.filter(item => item.status === 'PENDENTE')
        : resultadosCache

    if (itens.length === 0) {
        container.innerHTML = `<div class="empty"><i class="fas fa-inbox"></i><p>Nenhum aluno encontrado para este filtro.</p></div>`
        return
    }

    const linhas = itens.map(item => {
        const aluno = sanitizar(item.aluno_id)
        const nome = sanitizar(item.nome_completo || 'Aluno')
        const status = STATUS_PERMITIDOS.has(item.status) ? item.status : 'PENDENTE'
        const nota = item.nota === null || item.nota === undefined ? '—' : sanitizar(String(Number(item.nota).toFixed(2)))
        const conclusao = item.concluido_em ? sanitizar(fmtD(item.concluido_em) || '—') : '—'
        const podeCorrigir = Boolean(item.possui_discursiva)

        return `
            <tr>
                <td>${nome}</td>
                <td><span class="badge ${status === 'CONCLUIDA' ? 'bg-ok' : 'bg-pendente'}">${status}</span></td>
                <td>${nota}</td>
                <td>${conclusao}</td>
                <td style="display:flex;gap:8px;flex-wrap:wrap">
                    <button class="btn" data-acao="detalhes" data-aluno="${aluno}" data-nome="${nome}">
                        <i class="fas fa-eye"></i> Ver Detalhes
                    </button>
                    <button class="btn btn-p" data-acao="corrigir" data-aluno="${aluno}" data-nome="${nome}"
                        ${podeCorrigir ? '' : 'disabled title="Sem questões discursivas nesta prova"'}>
                        <i class="fas fa-pen"></i> Corrigir Discursivas
                    </button>
                </td>
            </tr>
        `
    }).join('')

    container.innerHTML = `
        <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
                <thead>
                    <tr>
                        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">Nome</th>
                        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">Status</th>
                        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">Nota</th>
                        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">Data de Conclusão</th>
                        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--bd)">Ações</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>
    `
}

async function abrirDetalhe(alunoId, nomeAluno) {
    const provaId = provaDaRota()
    if (!provaId || !alunoId) return

    const { data, error } = await sbCarregarDetalheResultadoIA(provaId, alunoId)
    if (error) {
        handleError(error)
        return
    }

    const detalhe = data || {}
    const possuiDiscursiva = Boolean(detalhe.possui_discursiva)
    const questoes = Array.isArray(detalhe.questoes) ? detalhe.questoes : []

    const itens = questoes.map(questao => {
        const numero = sanitizar(String(questao.ordem ?? ''))
        const enunciado = sanitizar(questao.enunciado || '')
        const gabarito = questao.gabarito && typeof questao.gabarito === 'object' ? questao.gabarito : {}
        const resposta = sanitizar(String(questao.resposta_aluno ?? '—'))
        const discursiva = questao.tipo === 'DISCURSIVA'

        if (discursiva) {
            const notaAtual = questao.nota_manual === null || questao.nota_manual === undefined
                ? ''
                : String(questao.nota_manual)
            return `
                <li style="margin-bottom:16px">
                    <strong>Questão ${numero} (discursiva)</strong> — ${enunciado}
                    <div style="font-size:13px;margin-top:6px">Resposta do aluno: ${resposta}</div>
                    <div style="font-size:13px;margin-top:4px">Referência: ${sanitizar(String(gabarito.resposta_referencia || '—'))}</div>
                    <label style="display:block;margin-top:8px;font-size:13px">
                        Nota manual (0 a ${sanitizar(String(questao.peso ?? 10))})
                        <input type="number" min="0" max="${sanitizar(String(questao.peso ?? 10))}" step="0.5"
                            value="${sanitizar(notaAtual)}" data-nota-questao="${sanitizar(questao.id)}"
                            style="display:block;width:120px;margin-top:4px;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:8px;color:var(--tx)">
                    </label>
                </li>
            `
        }

        const alternativas = Array.isArray(questao.alternativas)
            ? questao.alternativas.map(a => `${sanitizar(String(a?.chave || ''))}) ${sanitizar(String(a?.texto || ''))}`).join(' · ')
            : ''

        return `
            <li style="margin-bottom:16px">
                <strong>Questão ${numero}</strong> — ${enunciado}
                <div style="font-size:13px;margin-top:6px">Alternativas: ${alternativas}</div>
                <div style="font-size:13px;margin-top:4px">Resposta do aluno: ${resposta}</div>
                <div style="font-size:13px;margin-top:4px">Gabarito: ${sanitizar(String(gabarito.resposta_correta || '—'))}</div>
                <div style="font-size:13px;margin-top:4px">Justificativa: ${sanitizar(String(gabarito.justificativa || '—'))}</div>
            </li>
        `
    }).join('')

    const modal = openMdl(`
        <button class="mdl-x" data-acao="fechar" aria-label="Fechar detalhe"><i class="fas fa-times"></i></button>
        <div class="god-hd" style="margin-bottom:16px">
            <h2 id="tituloDetalheResultadoIA" style="font-size:20px"><i class="fas fa-file-lines"></i> Detalhe da Prova</h2>
            <p>${sanitizar(nomeAluno || detalhe.aluno_nome || 'Aluno')} — ${sanitizar(String(detalhe.status || 'PENDENTE'))}</p>
        </div>
        <div style="font-size:14px;margin-bottom:12px">
            <strong>Nota:</strong> ${detalhe.nota === null || detalhe.nota === undefined ? '—' : sanitizar(String(detalhe.nota))}
            &nbsp;|&nbsp; <strong>Conclusão:</strong> ${detalhe.concluido_em ? sanitizar(fmtD(detalhe.concluido_em) || '—') : '—'}
        </div>
        <ol style="font-size:14px">${itens || '<li>Nenhuma questão registrada.</li>'}</ol>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
            <button class="btn btn-p" type="button" data-acao="salvar-correcao"
                ${possuiDiscursiva ? '' : 'disabled title="Sem questões discursivas nesta prova"'}>
                <i class="fas fa-check"></i> Corrigir Discursivas
            </button>
            <button class="btn" type="button" data-acao="fechar" style="background:transparent;border:1px solid var(--bd)">Fechar</button>
        </div>
    `, { maxWidth: '780px' })

    const caixa = modal?.firstElementChild
    if (caixa) {
        caixa.setAttribute('role', 'dialog')
        caixa.setAttribute('aria-modal', 'true')
        caixa.setAttribute('aria-labelledby', 'tituloDetalheResultadoIA')
    }

    const fecharComEscape = (evento) => {
        if (evento.key === 'Escape') fecharModal()
    }
    ouvinteTeclado = fecharComEscape
    document.addEventListener('keydown', fecharComEscape)

    modal.addEventListener('click', async (evento) => {
        if (evento.target.closest('[data-acao="fechar"]')) {
            fecharModal()
            return
        }

        const salvar = evento.target.closest('[data-acao="salvar-correcao"]')
        if (!salvar || salvar.disabled) return

        const campos = modal.querySelectorAll('[data-nota-questao]')
        const correcoes = []
        for (const campo of campos) {
            const texto = String(campo.value ?? '').trim()
            if (!texto) continue
            const nota = Number(texto)
            if (!Number.isFinite(nota) || nota < 0) {
                toast('Informe notas válidas entre 0 e o peso da questão.', 'err')
                return
            }
            correcoes.push({ questaoId: campo.dataset.notaQuestao, nota })
        }

        if (correcoes.length === 0) {
            toast('Informe ao menos uma nota discursiva.', 'err')
            return
        }

        salvar.disabled = true
        for (const correcao of correcoes) {
            const { error: erroCorrecao } = await sbCorrigirRespostaDiscursivaIA({
                provaId,
                alunoId,
                questaoId: correcao.questaoId,
                nota: correcao.nota
            })
            if (erroCorrecao) {
                salvar.disabled = false
                handleError(erroCorrecao)
                return
            }
        }

        toast('Correção registrada com sucesso.', 'success')
        fecharModal()
        carregarResultados()
    })

    modal.querySelector('[data-acao="fechar"]')?.focus()
}

function fecharModal() {
    if (ouvinteTeclado) {
        document.removeEventListener('keydown', ouvinteTeclado)
        ouvinteTeclado = null
    }
    closeMdl()
}
