// ============================================================
// VIEW: TUTOR-SULSAFE (PROFESSOR I.A — IA 2)
// ============================================================
// Botão "Criar com o TUTOR-Sulsafe": o usuário informa só o assunto e o
// tipo (matéria/curso/palestra). O worker gera a ementa, grava como rascunho
// e aqui acontece a revisão humana antes de qualquer publicação.
//
// Regras de ouro desta tela:
//   * Nada é publicado automaticamente.
//   * Texto da IA passa por escapeHTML antes de entrar no DOM.
//   * A chave de API nunca aparece aqui (fica no Vault).
//   * Aluno não acessa esta view.

import { isProf, isAdmin, nav } from '../state.js'
import { handleError, $ } from '../utils.js'
import { escapeHTML } from '../chat-seguro.js'
import { TIPOS_TUTOR, montarPromptTutor, extrairNRsDoAssunto } from '../tutor-sulsafe.js'
import {
    sbCriarJobTutor,
    sbGerarComTutor,
    sbTutorHabilitado,
    sbListarRascunhosTutor,
    sbRevisarRascunhoTutor,
    sbMaterializarRascunhoTutor
} from '../supabase-client.js'

let ultimoResultado = null
let rascunhos = []

const TITULOS_TIPO = Object.freeze({
    MATERIA: 'Matéria de apoio',
    CURSO: 'Curso',
    PALESTRA: 'Palestra'
})

function permitido() {
    return isAdmin() || isProf()
}

function estadoVazio(mensagem) {
    return `<div class="empty"><i class="fas fa-wand-magic-sparkles"></i><p>${escapeHTML(mensagem)}</p></div>`
}

function renderEmenta(contrato) {
    if (!contrato) return ''

    const modulos = (contrato.modulos || []).map((modulo, i) => {
        const aulas = (modulo.aulas || []).map(aula => `
            <li style="margin:6px 0">
                <strong>${escapeHTML(aula.titulo)}</strong>
                <div style="opacity:.8;font-size:.9em">${escapeHTML(aula.descricao)}</div>
            </li>
        `).join('')

        return `
            <details style="margin:10px 0;padding:10px;border:1px solid var(--line,#444);border-radius:8px">
                <summary><strong>${i + 1}. ${escapeHTML(modulo.titulo)}</strong></summary>
                <p style="opacity:.85">${escapeHTML(modulo.descricao)}</p>
                <ul style="margin:0;padding-left:20px">${aulas}</ul>
            </details>
        `
    }).join('')

    const objetivos = (contrato.objetivos || []).map(o => `<li>${escapeHTML(o)}</li>`).join('')

    return `
        <div class="pnl" style="margin-top:18px">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-file-circle-check"></i> Ementa gerada — revisão obrigatória</div></div>
            <div style="padding:14px">
                <h3 style="margin:0 0 8px">${escapeHTML(contrato.titulo)}</h3>
                <p>${escapeHTML(contrato.descricao)}</p>
                <p><strong>Público-alvo:</strong> ${escapeHTML(contrato.publicoAlvo)}</p>
                <p><strong>Objetivos</strong></p>
                <ul>${objetivos}</ul>
                <p><strong>Módulos e aulas</strong></p>
                ${modulos}
                <div id="tutorRevisaoSlot" style="margin-top:16px"></div>
            </div>
        </div>
    `
}

function renderRascunhos() {
    if (!rascunhos.length) return estadoVazio('Nenhum rascunho ainda. Crie o primeiro acima.')

    return rascunhos.map(r => {
        const conteudo = r.conteudo || {}
        const status = r.materializado_tipo
            ? `Materializado em ${escapeHTML(r.materializado_tipo)} — NR ${escapeHTML(String(r.materializado_nr_id || ''))}`
            : r.publicado ? 'Publicado' : r.rejeitado ? 'Rejeitado' : r.aprovado ? 'Aprovado — aguardando materialização' : 'Aguardando revisão'

        return `
            <div class="pnl" style="margin:10px 0">
                <div class="pnl-h">
                    <div class="pnl-t">${escapeHTML(r.titulo)} <small>(${escapeHTML(r.tipo)})</small></div>
                </div>
                <div style="padding:12px">
                    <p style="opacity:.85">${escapeHTML(conteudo.descricao || '')}</p>
                    <p><strong>Status:</strong> ${status}</p>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        ${r.aprovado && !r.rejeitado && !r.materializado_tipo ? `
                            <button class="btn btn-sm btn-p" onclick="window.tutorAbrirMaterializar('${r.id}')">
                                <i class="fas fa-square-arrow-up-right"></i> Materializar
                            </button>
                        ` : ''}
                        ${!r.aprovado && !r.rejeitado ? `
                            <button class="btn btn-sm btn-p" onclick="window.tutorRevisar('${r.id}','APROVAR')">
                                <i class="fas fa-check"></i> Aprovar
                            </button>
                            <button class="btn btn-sm" onclick="window.tutorRevisar('${r.id}','REJEITAR')">
                                <i class="fas fa-xmark"></i> Rejeitar
                            </button>
                        ` : ''}
                    </div>
                    <div id="tutorMatSlot-${r.id}"></div>
                </div>
            </div>
        `
    }).join('')
}

export function vTutor() {
    if (!permitido()) {
        window.nav('inicio')
        return ''
    }

    const detectadas = extrairNRsDoAssunto($('#tutorAssunto')?.value || '')
    const contextoNR = detectadas.length
        ? detectadas.map(nr => `NR-${String(nr.numero).padStart(2, '0')}`).join(', ')
        : 'Nenhuma detectada — o Tutor escolherá as pertinentes'

    let h = `<div class="btn-back" onclick="nav('inicio')"><i class="fas fa-arrow-left"></i> Voltar</div>`
    h += `<h2 class="wc"><i class="fas fa-wand-magic-sparkles"></i> Criar com o TUTOR-Sulsafe</h2>`
    h += `<p class="wcs">Diga apenas o assunto. O Tutor monta a estrutura, direciona pelas NRs, corrige o formato e gera um rascunho. Nada é publicado sem sua revisão.</p>`

    h += `<div class="pnl"><div class="pnl-h"><div class="pnl-t"><i class="fas fa-plus"></i> Novo conteúdo</div></div><div style="padding:14px">`
    h += `<form id="tutorForm" onsubmit="window.tutorGerar(event)">`
    h += `<label><strong>Tipo</strong><br>
        <select id="tutorTipo" name="tipo" style="min-width:220px;margin:6px 0 12px">
            <option value="${TIPOS_TUTOR.MATERIA}">${TITULOS_TIPO.MATERIA}</option>
            <option value="${TIPOS_TUTOR.CURSO}" selected>${TITULOS_TIPO.CURSO}</option>
            <option value="${TIPOS_TUTOR.PALESTRA}">${TITULOS_TIPO.PALESTRA}</option>
        </select></label><br>`
    h += `<label><strong>Assunto</strong><br>
        <textarea id="tutorAssunto" name="assunto" rows="3" maxlength="4000"
            placeholder="Ex.: Crie um curso sobre NR 35 para novos colaboradores"
            style="width:100%;margin:6px 0" oninput="window.tutorAtualizarNR()"></textarea></label>`
    h += `<p id="tutorNRContexto" style="opacity:.75;font-size:.9em">NRs detectadas: ${escapeHTML(contextoNR)}</p>`
    h += `<label><strong>Público-alvo (opcional)</strong><br>
        <input id="tutorPublico" name="publico" maxlength="300" placeholder="Ex.: Colaboradores da obra" style="width:100%;margin:6px 0 14px"></label>`
    h += `<button class="btn btn-p" id="tutorBtnGerar" type="submit"><i class="fas fa-wand-magic-sparkles"></i> Criar com o TUTOR-Sulsafe</button>`
    h += `</form><div id="tutorErro"></div><div id="tutorAvisoConfig"></div></div></div>`

    h += `<div id="tutorEmentaSlot">${ultimoResultado ? renderEmenta(ultimoResultado.contrato) : ''}</div>`
    h += `<h3 style="margin-top:24px"><i class="fas fa-clock-rotate-left"></i> Rascunhos recentes</h3>`
    h += `<div id="tutorListaSlot">${renderRascunhos()}</div>`

    // Carrega a lista em background sem bloquear o primeiro render.
    carregarRascunhos()
    carregarAvisoConfig()

    return h
}

async function carregarAvisoConfig() {
    const slot = $('#tutorAvisoConfig')
    if (!slot) return

    const { data, error } = await sbTutorHabilitado()
    if (error || data) return

    slot.innerHTML = `
        <p style="color:var(--warn,#d90);margin-top:12px">
            <i class="fas fa-triangle-exclamation"></i>
            O Professor I.A. ainda não foi ativado. Peça a um ADMIN para configurar
            o provedor em <strong>Modo Deus → PROFESSOR I.A — API</strong>.
        </p>
    `
}

export async function tutorAtualizarNR() {
    const campo = $('#tutorAssunto')
    const alvo = $('#tutorNRContexto')
    if (!campo || !alvo) return

    const detectadas = extrairNRsDoAssunto(campo.value)
    alvo.textContent = detectadas.length
        ? `NRs detectadas: ${detectadas.map(nr => `NR-${String(nr.numero).padStart(2, '0')}`).join(', ')}`
        : 'Nenhuma detectada — o Tutor escolherá as pertinentes'
}

async function carregarRascunhos() {
    const { data, error } = await sbListarRascunhosTutor()
    if (error) return

    rascunhos = data
    const slot = $('#tutorListaSlot')
    if (slot) slot.innerHTML = renderRascunhos()
}

export async function tutorGerar(event) {
    event?.preventDefault()
    if (!permitido()) return

    const assunto = $('#tutorAssunto')?.value || ''
    const tipo = $('#tutorTipo')?.value || TIPOS_TUTOR.CURSO
    const publicoAlvo = $('#tutorPublico')?.value || ''
    const erroSlot = $('#tutorErro')
    const botao = $('#tutorBtnGerar')

    if (erroSlot) erroSlot.innerHTML = ''
    if (!assunto.trim()) {
        if (erroSlot) erroSlot.innerHTML = `<p style="color:var(--err,#e44)">Informe o assunto.</p>`
        return
    }

    if (botao) {
        botao.disabled = true
        botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i> O Tutor está montando...'
    }

    try {
        const titulo = assunto.trim().slice(0, 160)
        const prompt = montarPromptTutor({ assunto, tipo, publicoAlvo })

        const { data: jobId, error: erroJob } = await sbCriarJobTutor({
            titulo, prompt, tipo, provedor: null
        })
        if (erroJob) throw erroJob

        const { data, error } = await sbGerarComTutor(jobId)
        if (error) throw error

        ultimoResultado = data
        const slot = $('#tutorEmentaSlot')
        if (slot) slot.innerHTML = renderEmenta(data.contrato)

        const revisao = $('#tutorRevisaoSlot')
        if (revisao) {
            revisao.innerHTML = `
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <button class="btn btn-sm btn-p" onclick="window.tutorRevisar('${data.conteudoId}','APROVAR')">
                        <i class="fas fa-check"></i> Aprovar rascunho
                    </button>
                    <button class="btn btn-sm" onclick="window.tutorRevisar('${data.conteudoId}','REJEITAR')">
                        <i class="fas fa-xmark"></i> Rejeitar
                    </button>
                </div>
                <p style="opacity:.7;font-size:.85em;margin-top:8px">
                    Modo ${escapeHTML(data.mode)} · job ${escapeHTML(data.jobId)} ·
                    A aprovação não publica: escolha a NR e o destino na etapa seguinte.
                </p>
            `
        }

        await carregarRascunhos()
        window.toast?.('Ementa gerada. Revise antes de aprovar.', 'success')
    } catch (error) {
        handleError(error)
        if (erroSlot) {
            erroSlot.innerHTML = `<p style="color:var(--err,#e44)">${escapeHTML(error?.message || 'Falha ao gerar.')}</p>`
        }
    } finally {
        if (botao) {
            botao.disabled = false
            botao.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Criar com o TUTOR-Sulsafe'
        }
    }
}

export async function tutorRevisar(conteudoId, decisao) {
    if (!permitido()) return

    let observacao = null
    if (decisao === 'REJEITAR') {
        observacao = window.prompt('Motivo da rejeição (mínimo 3 caracteres):')
        if (!observacao || observacao.trim().length < 3) return
    }

    const { error } = await sbRevisarRascunhoTutor(conteudoId, decisao, observacao)
    if (error) return handleError(error)

    window.toast?.(decisao === 'APROVAR' ? 'Rascunho aprovado.' : 'Rascunho rejeitado.', 'success')
    await carregarRascunhos()

    const revisao = $('#tutorRevisaoSlot')
    if (revisao && decisao === 'APROVAR') {
        revisao.innerHTML += `
            <p style="margin-top:10px;color:var(--ok,#3a3)">
                <i class="fas fa-check-circle"></i> Aprovado. Use "Materializar" na lista de rascunhos para escolher a NR e o destino.
            </p>
        `
    }
}

export async function tutorAbrirMaterializar(conteudoId) {
    if (!permitido()) return

    const slot = $(`#tutorMatSlot-${conteudoId}`)
    if (!slot) return

    const nr = window.prompt('Número da NR de destino (1 a 38):', '35')
    if (!nr || !/^\d{1,2}$/.test(nr.trim()) || Number(nr) < 1 || Number(nr) > 38) {
        window.toast?.('Informe uma NR válida (1 a 38).', 'err')
        return
    }

    const destino = window.confirm('OK = Videoaula | Cancelar = Material de apoio') ? 'VIDEOAULA' : 'MATERIAL'
    let url = null
    if (destino === 'MATERIAL') {
        url = window.prompt('URL do material (https://...):')
        if (!url || !/^https:\/\//i.test(url.trim())) {
            window.toast?.('Material requer uma URL https://.', 'err')
            return
        }
    }

    const { data, error } = await sbMaterializarRascunhoTutor({
        conteudoId,
        nrId: Number(nr),
        destino,
        url
    })

    if (error) return handleError(error)

    slot.innerHTML = `<p style="color:var(--ok,#3a3)">
        <i class="fas fa-check-circle"></i> ${escapeHTML(data.destino)} criada na NR ${escapeHTML(String(data.nr_id))}
        como rascunho (publico = false). A liberação para alunos é uma decisão separada.
    </p>`

    await carregarRascunhos()
}

// Exposições globais usadas pelos templates inline (padrão do projeto).
window.vTutor = vTutor
window.tutorGerar = tutorGerar
window.tutorAtualizarNR = tutorAtualizarNR
window.tutorRevisar = tutorRevisar
window.tutorAbrirMaterializar = tutorAbrirMaterializar
