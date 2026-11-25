// ============================================================
// VIEW: PROVAS PENDENTES DE REVISÃO (HITL — FASE 5, ETAPA 4)
// ============================================================
// Lista provas geradas pelo Tutor, abre modal com questões/gabarito restrito,
// permite editar questões e aprovar/rejeitar. Nada é distribuído a alunos.
// ============================================================

import { S, NRS, fmtD, nav, isAdmin, isProf } from '../state.js'
import {
    sbGetRevisaoProvaFilaIA,
    sbObterRevisaoProvaIA,
    sbEditarQuestaoProvaIA,
    sbAprovarProvaIA,
    sbRejeitarProvaIA
} from '../supabase-client.js'
import { toast, handleError, openMdl, closeMdl, sanitizar, $, $$ } from '../utils.js'

let revisaoAtual = null
let ouvinteTeclado = null

export function vProvasPendentesIA() {
    if (!isAdmin() && !isProf()) return nav('inicio')

    return `
        <div class="btn-back" onclick="window.nav('inicio')">
            <i class="fas fa-arrow-left"></i> Voltar
        </div>
        <div class="god-hd">
            <h2><i class="fas fa-file-circle-check"></i> Provas Pendentes de Revisão</h2>
            <p>Provas geradas pelo TUTOR-Sulsafe aguardando decisão humana — ${sanitizar(S.user?.email || '')}</p>
        </div>
        <div class="pnl">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-list-check"></i> Fila de aprovação</div></div>
            <p style="font-size:13px;color:var(--tx2);margin-bottom:14px">
                O gabarito só é exibido nesta área restrita. Aprovar não distribui a prova: a escolha do destino acontece na próxima etapa.
            </p>
            <div id="listaProvasPendentesIA" aria-live="polite" aria-busy="true">
                <div class="empty" role="status"><i class="fas fa-spinner fa-spin"></i><p>Carregando provas pendentes...</p></div>
            </div>
        </div>
    `
}

export function iniciarProvasPendentesIA() {
    const container = $('#listaProvasPendentesIA')
    if (!container) return

    container.addEventListener('click', (evento) => {
        const botao = evento.target.closest('[data-acao]')
        if (!botao || !container.contains(botao)) return

        const acao = botao.dataset.acao
        if (acao === 'revisar') abrirRevisao(botao.dataset.prova)
    })

    carregarFila()
}

async function carregarFila() {
    const container = $('#listaProvasPendentesIA')
    if (!container) return

    container.setAttribute('aria-busy', 'true')
    container.innerHTML = `<div class="empty" role="status"><i class="fas fa-spinner fa-spin"></i><p>Carregando provas pendentes...</p></div>`

    const { data, error } = await sbGetRevisaoProvaFilaIA()
    if (!container.isConnected) return

    container.setAttribute('aria-busy', 'false')
    if (error) {
        container.innerHTML = `<div class="empty" role="alert"><i class="fas fa-triangle-exclamation"></i><p>${sanitizar(error.message || 'Não foi possível carregar a fila.')}</p></div>`
        return
    }

    if (!data || data.length === 0) {
        container.innerHTML = `<div class="empty"><i class="fas fa-check-circle"></i><p>Nenhuma prova aguardando revisão.</p></div>`
        return
    }

    container.innerHTML = data.map(cardHtml).join('')
}

function nrLegenda(nrId) {
    if (!nrId) return 'NR não informada'
    const nr = NRS.find(item => Number(item.id) === Number(nrId))
    return nr ? `NR ${nr.id} — ${nr.nome}` : `NR ${sanitizar(String(nrId))}`
}

function cardHtml(prova) {
    const id = sanitizar(prova.prova_id || prova.conteudo_id)
    return `
        <article class="pnl" style="margin-bottom:12px">
            <div class="pnl-h">
                <div class="pnl-t"><i class="fas fa-file-lines"></i> ${sanitizar(prova.titulo || 'Prova sem título')}</div>
                <span class="badge bg-pendente">Aguardando revisão</span>
            </div>
            <div style="display:grid;gap:6px;font-size:13px;color:var(--tx2);margin-bottom:14px">
                <div><strong>NR associada:</strong> ${nrLegenda(prova.nr_id)}</div>
                <div><strong>Data de Geração:</strong> ${sanitizar(fmtD(prova.criado_em) || '—')}</div>
                <div><strong>Questões:</strong> ${sanitizar(String(prova.quantidade_questoes ?? 0))}</div>
            </div>
            <button class="btn btn-p" data-acao="revisar" data-prova="${id}">
                <i class="fas fa-magnifying-glass"></i> Revisar Prova
            </button>
        </article>
    `
}

async function abrirRevisao(provaId) {
    const modal = openMdl(`
        <button class="mdl-x" data-acao="fechar" aria-label="Fechar revisão"><i class="fas fa-times"></i></button>
        <div class="god-hd" style="margin-bottom:16px">
            <h2 id="tituloRevisaoIA" style="font-size:20px"><i class="fas fa-file-circle-check"></i> Revisar Prova</h2>
            <p>Gabarito visível apenas para professor/admin.</p>
        </div>
        <div id="corpoRevisaoIA" role="status" aria-live="polite">
            <div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando questões...</p></div>
        </div>
        <div class="pnl" style="margin-top:16px">
            <label for="motivoRejeicaoIA" style="display:block;font-size:13px;font-weight:700;margin-bottom:6px">
                Motivo da rejeição (opcional)
            </label>
            <textarea id="motivoRejeicaoIA" rows="2" maxlength="500" placeholder="Descreva por que a prova foi rejeitada"
                style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:10px;color:var(--tx)"></textarea>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
            <button class="btn btn-p" data-acao="aprovar"><i class="fas fa-check"></i> Aprovar e Publicar</button>
            <button class="btn btn-d" data-acao="rejeitar"><i class="fas fa-xmark"></i> Rejeitar</button>
            <button class="btn" data-acao="fechar" style="background:transparent;border:1px solid var(--bd)">Cancelar</button>
        </div>
    `, { maxWidth: '900px' })

    const caixa = modal?.firstElementChild
    if (caixa) {
        caixa.setAttribute('role', 'dialog')
        caixa.setAttribute('aria-modal', 'true')
        caixa.setAttribute('aria-labelledby', 'tituloRevisaoIA')
    }

    const fecharComEscape = (evento) => {
        if (evento.key === 'Escape') fecharModal()
    }
    ouvinteTeclado = fecharComEscape
    document.addEventListener('keydown', fecharComEscape)

    modal.addEventListener('click', async (evento) => {
        const botao = evento.target.closest('[data-acao]')
        if (!botao || !modal.contains(botao)) return

        const acao = botao.dataset.acao
        if (acao === 'fechar') return fecharModal()
        if (acao === 'editar') return abrirEdicao(botao.dataset.questao)
        if (acao === 'cancelar-edicao') return recarregarCorpo()
        if (acao === 'salvar-edicao') return salvarEdicao(botao.dataset.questao, botao.closest('[data-form-edicao]'))
        if (acao === 'aprovar' || acao === 'rejeitar') return decidir(acao, botao)
    })

    modal.querySelector('[data-acao="fechar"]')?.focus()

    const { data, error } = await sbObterRevisaoProvaIA(provaId)
    if (!modal.isConnected || modal.style.display === 'none') return

    if (error) {
        const corpo = $('#corpoRevisaoIA')
        if (corpo) corpo.innerHTML = `<div class="empty" role="alert"><i class="fas fa-triangle-exclamation"></i><p>${sanitizar(error.message || 'Não foi possível abrir a revisão.')}</p></div>`
        return
    }

    revisaoAtual = data
    recarregarCorpo()
}

function recarregarCorpo() {
    const corpo = $('#corpoRevisaoIA')
    if (!corpo || !revisaoAtual) return
    corpo.innerHTML = htmlQuestoes(revisaoAtual)
}

function htmlQuestoes(revisao) {
    const questoes = Array.isArray(revisao.questoes) ? revisao.questoes : []
    if (questoes.length === 0) {
        return `<div class="empty"><i class="fas fa-circle-info"></i><p>Esta prova ainda não tem questões materializadas.</p></div>`
    }

    return questoes.map(questao => {
        const alternativas = Array.isArray(questao.alternativas) ? questao.alternativas : []
        const lista = alternativas.map(alternativa => `
            <li style="margin:4px 0">
                <strong>${sanitizar(alternativa?.chave || '?')})</strong>
                ${sanitizar(alternativa?.texto || '')}
            </li>
        `).join('')
        const gabarito = questao.gabarito || {}
        const questaoId = sanitizar(questao.id)

        return `
            <article class="pnl" style="margin-bottom:12px">
                <div class="pnl-h"><div class="pnl-t">Questão ${sanitizar(String(questao.ordem ?? ''))}</div></div>
                <p style="font-size:14px;line-height:1.55">${sanitizar(questao.enunciado || '')}</p>
                <ul style="margin:10px 0 0 20px;font-size:13px">${lista}</ul>
                <div style="margin-top:12px;padding:10px 12px;border-left:4px solid var(--p);background:rgba(46,125,50,.08);font-size:13px"
                     aria-label="Gabarito — restrito a professor/admin">
                    <strong>Gabarito:</strong> ${sanitizar(gabarito.resposta_correta || '—')}
                    <span style="color:var(--tx2)"> — ${sanitizar(gabarito.justificativa || 'Sem justificativa')}</span>
                </div>
                <button class="btn btn-sm" data-acao="editar" data-questao="${questaoId}" style="margin-top:12px">
                    <i class="fas fa-pen"></i> Editar Questão
                </button>
                <div data-form-edicao="${questaoId}" hidden style="margin-top:12px"></div>
            </article>
        `
    }).join('')
}

function abrirEdicao(questaoId) {
    const questao = (revisaoAtual?.questoes || []).find(item => item.id === questaoId)
    const alvo = $(`[data-form-edicao="${questaoId}"]`)
    if (!questao || !alvo) return

    const linhas = (questao.alternativas || [])
        .map(item => `${item?.chave || ''}|${item?.texto || ''}`)
        .join('\n')
    const chaves = (questao.alternativas || []).map(item => item?.chave || '')
    const atual = questao.gabarito?.resposta_correta || ''

    alvo.innerHTML = `
        <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px">Enunciado
            <textarea data-campo="enunciado" rows="3" maxlength="1000" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:10px;color:var(--tx)">${sanitizar(questao.enunciado || '')}</textarea>
        </label>
        <label style="display:block;font-size:12px;font-weight:700;margin:10px 0 4px">Alternativas (uma por linha: A|texto)
            <textarea data-campo="alternativas" rows="5" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:10px;color:var(--tx)">${sanitizar(linhas)}</textarea>
        </label>
        <label style="display:block;font-size:12px;font-weight:700;margin:10px 0 4px">Resposta correta
            <select data-campo="resposta" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:10px;color:var(--tx)">
                ${chaves.map(chave => `<option value="${sanitizar(chave)}" ${chave === atual ? 'selected' : ''}>${sanitizar(chave)}</option>`).join('')}
            </select>
        </label>
        <label style="display:block;font-size:12px;font-weight:700;margin:10px 0 4px">Justificativa
            <textarea data-campo="justificativa" rows="2" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:10px;color:var(--tx)">${sanitizar(questao.gabarito?.justificativa || '')}</textarea>
        </label>
        <div style="display:flex;gap:8px;margin-top:12px">
            <button class="btn btn-sm btn-p" data-acao="salvar-edicao" data-questao="${sanitizar(questaoId)}">Salvar edição</button>
            <button class="btn btn-sm" data-acao="cancelar-edicao" style="background:transparent;border:1px solid var(--bd)">Cancelar</button>
        </div>
    `
    alvo.hidden = false
    alvo.querySelector('[data-campo="enunciado"]')?.focus()
}

async function salvarEdicao(questaoId, formulario) {
    if (!formulario || !revisaoAtual) return

    const enunciado = String(formulario.querySelector('[data-campo="enunciado"]')?.value || '').trim()
    const resposta = String(formulario.querySelector('[data-campo="resposta"]')?.value || '').trim()
    const justificativa = String(formulario.querySelector('[data-campo="justificativa"]')?.value || '').trim()
    const linhas = String(formulario.querySelector('[data-campo="alternativas"]')?.value || '')
        .split('\n')
        .map(linha => linha.trim())
        .filter(Boolean)

    if (linhas.length < 2 || linhas.length > 5) {
        toast('Informe de 2 a 5 alternativas.', 'err')
        return
    }

    const alternativas = linhas.map(linha => {
        const separador = linha.indexOf('|')
        return {
            chave: separador === -1 ? '' : linha.slice(0, separador).trim().toUpperCase(),
            texto: separador === -1 ? linha : linha.slice(separador + 1).trim()
        }
    })

    if (alternativas.some(item => !item.chave || !item.texto)) {
        toast('Use o formato A|texto em cada alternativa.', 'err')
        return
    }
    if (!alternativas.some(item => item.chave === resposta)) {
        toast('A resposta correta deve ser uma das alternativas.', 'err')
        return
    }
    if (!justificativa) {
        toast('Informe a justificativa do gabarito.', 'err')
        return
    }

    const { error } = await sbEditarQuestaoProvaIA({
        questaoId,
        enunciado,
        alternativas,
        gabarito: { resposta_correta: resposta, justificativa }
    })

    if (error) {
        handleError(error)
        return
    }

    toast('Questão atualizada e auditoria registrada.', 'success')
    const atualizada = await sbObterRevisaoProvaIA(revisaoAtual.prova_id)
    if (!atualizada.error && atualizada.data) {
        revisaoAtual = atualizada.data
        recarregarCorpo()
    }
}

async function decidir(acao, botao) {
    if (!revisaoAtual) return

    const botoes = $$('#mdlGlobal button')
    botoes.forEach(item => { item.disabled = true })

    const motivo = String($('#motivoRejeicaoIA')?.value || '').trim()
    const { error } = acao === 'aprovar'
        ? await sbAprovarProvaIA(revisaoAtual.prova_id)
        : await sbRejeitarProvaIA(revisaoAtual.prova_id, motivo)

    botoes.forEach(item => { item.disabled = false })
    if (error) {
        handleError(error)
        return
    }

    toast(acao === 'aprovar'
        ? 'Prova aprovada e publicada. A distribuição será feita na próxima etapa.'
        : 'Prova rejeitada e registrada na auditoria.',
    'success')
    fecharModal()
    carregarFila()
}

function fecharModal() {
    if (ouvinteTeclado) {
        document.removeEventListener('keydown', ouvinteTeclado)
        ouvinteTeclado = null
    }
    revisaoAtual = null
    closeMdl()
}
