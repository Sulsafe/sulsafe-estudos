// ============================================================
// VIEW: DISTRIBUIÇÃO DE PROVAS APROVADAS (HITL — FASE 5, ETAPA 5)
// ============================================================
// Lista provas já aprovadas na Etapa 4 e permite escolher TURMA, ALUNO,
// CATALOGO ou INTERNO. Nada aqui é entregue antes da confirmação explícita.
// ============================================================

import { S, NRS, fmtD, nav, isAdmin, isProf } from '../state.js'
import {
    sbListarProvasAprovadasIA,
    sbListarDestinosDistribuicaoIA,
    sbDistribuirProvaIA
} from '../supabase-client.js'
import { toast, handleError, openMdl, closeMdl, sanitizar, $ } from '../utils.js'
import { abrirResultadosProva } from './provas-resultados-ia.js'

let ouvinteTeclado = null

export function vProvasDistribuicaoIA() {
    if (!isAdmin() && !isProf()) return nav('inicio')

    return `
        <div class="btn-back" onclick="window.nav('inicio')">
            <i class="fas fa-arrow-left"></i> Voltar
        </div>
        <div class="god-hd">
            <h2><i class="fas fa-paper-plane"></i> Distribuir Provas Aprovadas</h2>
            <p>Escolha o destino das provas revisadas pelo TUTOR-Sulsafe — ${sanitizar(S.user?.email || '')}</p>
        </div>
        <div class="pnl">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-list-check"></i> Provas aprovadas</div></div>
            <p style="font-size:13px;color:var(--tx2);margin-bottom:14px">
                Aprovar (Etapa 4) não entrega a prova. Somente esta decisão cria vínculos e notificações.
            </p>
            <div id="listaProvasAprovadasIA" aria-live="polite" aria-busy="true">
                <div class="empty" role="status"><i class="fas fa-spinner fa-spin"></i><p>Carregando provas aprovadas...</p></div>
            </div>
        </div>
    `
}

export function iniciarProvasDistribuicaoIA() {
    const container = $('#listaProvasAprovadasIA')
    if (!container) return

    container.addEventListener('click', (evento) => {
        const botao = evento.target.closest('[data-acao="distribuir"]')
        if (botao && container.contains(botao) && !botao.disabled) {
            abrirDistribuicaoProvaIA(botao.dataset.prova, botao.dataset.titulo, carregarFila)
            return
        }
        const resultados = evento.target.closest('[data-acao="resultados"]')
        if (resultados && container.contains(resultados) && !resultados.disabled) {
            abrirResultadosProva(resultados.dataset.prova)
        }
    })

    carregarFila()
}

async function carregarFila() {
    const container = $('#listaProvasAprovadasIA')
    if (!container) return

    container.setAttribute('aria-busy', 'true')
    container.innerHTML = `<div class="empty" role="status"><i class="fas fa-spinner fa-spin"></i><p>Carregando provas aprovadas...</p></div>`

    const { data, error } = await sbListarProvasAprovadasIA()
    if (!container.isConnected) return

    container.setAttribute('aria-busy', 'false')
    if (error) {
        container.innerHTML = `<div class="empty" role="alert"><i class="fas fa-triangle-exclamation"></i><p>${sanitizar(error.message || 'Não foi possível carregar as provas.')}</p></div>`
        return
    }

    if (!data || data.length === 0) {
        container.innerHTML = `<div class="empty"><i class="fas fa-check-circle"></i><p>Nenhuma prova aprovada aguardando distribuição.</p></div>`
        return
    }

    container.innerHTML = data.map(cardHtml).join('')
}

function nrLegenda(nrId) {
    if (!nrId) return 'NR não informada'
    const nr = NRS.find(item => Number(item.id) === Number(nrId))
    return nr ? `NR ${nr.id} — ${nr.nome}` : `NR ${sanitizar(String(nrId))}`
}

function statusHtml(prova) {
    if (!prova.destino_tipo) return '<span class="badge bg-pendente">Aguardando distribuição</span>'
    if (prova.destino_tipo === 'INTERNO') return '<span class="badge">Rascunho interno</span>'
    return '<span class="badge bg-ok">Distribuída</span>'
}

function cardHtml(prova) {
    const id = sanitizar(prova.prova_id)
    const titulo = sanitizar(prova.titulo || 'Prova sem título')
    const jaDistribuida = Boolean(prova.distribuido_em)

    return `
        <article class="pnl" style="margin-bottom:12px">
            <div class="pnl-h">
                <div class="pnl-t"><i class="fas fa-file-lines"></i> ${titulo}</div>
                ${statusHtml(prova)}
            </div>
            <div style="display:grid;gap:6px;font-size:13px;color:var(--tx2);margin-bottom:14px">
                <div><strong>NR associada:</strong> ${nrLegenda(prova.nr_id)}</div>
                <div><strong>Data de Geração:</strong> ${sanitizar(fmtD(prova.criado_em) || '—')}</div>
                <div><strong>Questões:</strong> ${sanitizar(String(prova.quantidade_questoes ?? 0))}</div>
            </div>
            <button class="btn btn-p" data-acao="distribuir" data-prova="${id}" data-titulo="${titulo}"
                ${jaDistribuida ? 'disabled title="Esta prova já foi distribuída"' : ''}>
                <i class="fas fa-paper-plane"></i> ${jaDistribuida ? 'Já distribuída' : 'Distribuir Prova'}
            </button>
            <button class="btn" data-acao="resultados" data-prova="${id}" data-titulo="${titulo}"
                ${jaDistribuida ? '' : 'disabled title="Distribua a prova antes de ver resultados"'}>
                <i class="fas fa-chart-simple"></i> Ver Resultados
            </button>
        </article>
    `
}

// Reutilizada pela aba "Provas da IA" na Área do Professor. O callback
// permite atualizar a lista correta sem depender da view legada.
export async function abrirDistribuicaoProvaIA(provaId, titulo, aoConcluir = null) {
    const { data: destinos, error } = await sbListarDestinosDistribuicaoIA()
    if (error) {
        handleError(error)
        return
    }

    const turmas = Array.isArray(destinos?.turmas) ? destinos.turmas : []
    const alunos = Array.isArray(destinos?.alunos) ? destinos.alunos : []

    const opcoesTurma = turmas.map(turma => `
        <option value="${sanitizar(turma.id)}">${sanitizar(turma.nome || 'Turma')} (${sanitizar(String(turma.quantidade_alunos ?? 0))} alunos)</option>
    `).join('')
    const opcoesAluno = alunos.map(aluno => `
        <option value="${sanitizar(aluno.id)}">${sanitizar(aluno.nome || 'Aluno')}</option>
    `).join('')

    const modal = openMdl(`
        <button class="mdl-x" data-acao="fechar" aria-label="Fechar distribuição"><i class="fas fa-times"></i></button>
        <div class="god-hd" style="margin-bottom:16px">
            <h2 id="tituloDistribuicaoIA" style="font-size:20px"><i class="fas fa-paper-plane"></i> Distribuir Prova</h2>
            <p>${sanitizar(titulo || 'Prova aprovada')}</p>
        </div>
        <form id="formDistribuicaoIA">
            <fieldset style="border:1px solid var(--bd);border-radius:var(--r);padding:14px">
                <legend style="font-size:13px;font-weight:700;padding:0 6px">Destino da prova</legend>

                <label style="display:block;margin:8px 0;font-size:13px">
                    <input type="radio" name="destino" value="TURMA" checked> Turma
                </label>
                <label style="display:block;margin:8px 0 18px 20px;font-size:13px">
                    Selecionar turma
                    <select name="turma_id" style="display:block;width:100%;margin-top:4px;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:10px;color:var(--tx)">
                        ${opcoesTurma || '<option value="">Nenhuma turma disponível</option>'}
                    </select>
                </label>

                <label style="display:block;margin:8px 0;font-size:13px">
                    <input type="radio" name="destino" value="ALUNO"> Aluno
                </label>
                <label style="display:block;margin:8px 0 18px 20px;font-size:13px">
                    Selecionar aluno
                    <select name="aluno_id" style="display:block;width:100%;margin-top:4px;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:10px;color:var(--tx)">
                        ${opcoesAluno || '<option value="">Nenhum aluno disponível</option>'}
                    </select>
                </label>

                <label style="display:block;margin:8px 0;font-size:13px">
                    <input type="radio" name="destino" value="CATALOGO"> Catálogo
                    <span style="color:var(--tx2)"> — todos os alunos da empresa</span>
                </label>

                <label style="display:block;margin:8px 0;font-size:13px">
                    <input type="radio" name="destino" value="INTERNO"> Rascunho Interno
                    <span style="color:var(--tx2)"> — mantém a prova no banco, sem distribuir</span>
                </label>
            </fieldset>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
                <button class="btn btn-p" type="submit"><i class="fas fa-check"></i> Confirmar distribuição</button>
                <button class="btn" type="button" data-acao="fechar" style="background:transparent;border:1px solid var(--bd)">Cancelar</button>
            </div>
        </form>
    `, { maxWidth: '680px' })

    const caixa = modal?.firstElementChild
    if (caixa) {
        caixa.setAttribute('role', 'dialog')
        caixa.setAttribute('aria-modal', 'true')
        caixa.setAttribute('aria-labelledby', 'tituloDistribuicaoIA')
    }

    const fecharComEscape = (evento) => {
        if (evento.key === 'Escape') fecharModal()
    }
    ouvinteTeclado = fecharComEscape
    document.addEventListener('keydown', fecharComEscape)

    // openMdl reaproveita #mdlGlobal. Listeners acumulados distribuiriam a
    // prova uma vez por abertura do modal; handlers de propriedade substituem
    // o handler anterior.
    modal.onclick = (evento) => {
        if (evento.target.closest('[data-acao="fechar"]')) fecharModal()
    }

    modal.onsubmit = async (evento) => {
        evento.preventDefault()
        const formulario = evento.target
        const destinoTipo = String(formulario.elements.destino?.value || '').toUpperCase()
        let destinoId = null

        if (destinoTipo === 'TURMA') destinoId = formulario.elements.turma_id?.value || null
        if (destinoTipo === 'ALUNO') destinoId = formulario.elements.aluno_id?.value || null
        if (['TURMA', 'ALUNO'].includes(destinoTipo) && !destinoId) {
            toast('Selecione um destino válido.', 'err')
            return
        }

        const botao = formulario.querySelector('[type="submit"]')
        if (botao) botao.disabled = true

        const { error: erro } = await sbDistribuirProvaIA({ provaId, destinoTipo, destinoId })
        if (botao) botao.disabled = false
        if (erro) {
            handleError(erro)
            return
        }

        toast(destinoTipo === 'INTERNO'
            ? 'Prova mantida como rascunho interno.'
            : 'Prova distribuída e alunos notificados.',
        'success')
        fecharModal()
        if (typeof aoConcluir === 'function') await aoConcluir()
        else await carregarFila()
    }

    modal.querySelector('[data-acao="fechar"]')?.focus()
}

function fecharModal() {
    if (ouvinteTeclado) {
        document.removeEventListener('keydown', ouvinteTeclado)
        ouvinteTeclado = null
    }
    closeMdl()
}
