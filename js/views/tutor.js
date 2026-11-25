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
import {
    TIPOS_TUTOR,
    montarPromptTutor,
    montarPromptBaseFase5,
    extrairNRsDoAssunto
} from '../tutor-sulsafe.js'
import {
    QUANTIDADE_QUESTOES_PADRAO,
    QUANTIDADES_PROVA_PERMITIDAS,
    normalizarQuantidadeQuestoes
} from '../tutor-contratos-fase5-core.js'
import {
    sbCriarJobTutor,
    sbGerarComTutor,
    sbTutorHabilitado,
    sbListarRascunhosTutor,
    sbRevisarRascunhoTutor,
    sbMaterializarRascunhoTutor,
    sbDirecionarConteudoTutor,
    sbPublicarConteudoTutor,
    sbGetTurmas
} from '../supabase-client.js'

let ultimoResultado = null
let rascunhos = []
let turmasTutorCache = []

const TIPO_TUTOR_PROVA = 'PROVA'

const TITULOS_TIPO = Object.freeze({
    MATERIA: 'Matéria de apoio',
    CURSO: 'Curso',
    PALESTRA: 'Palestra',
    PROVA: 'Prova (múltipla escolha)'
})

const TIPOS_TURMA = Object.freeze({
    turma: 'Turma',
    individual: 'Individual',
    atualizacao: 'Atualização'
})

function rascunhoPublico(rascunho) {
    return rascunho?.conteudo?.publico === true || rascunho?.publicado === true
}

function statusRascunho(rascunho) {
    if (!rascunho.materializado_tipo) {
        return rascunho.publicado
            ? 'Publicado'
            : rascunho.rejeitado
                ? 'Rejeitado'
                : rascunho.aprovado
                    ? 'Aprovado — aguardando materialização'
                    : 'Aguardando revisão'
    }

    const base = `Materializado em ${rascunho.materializado_tipo} — NR ${rascunho.materializado_nr_id ?? ''}`
    const destino = rascunho.conteudo?.materializado_destino || 'INTERNO'

    if (destino === 'GLOBAL' || rascunhoPublico(rascunho)) {
        return `${base} · Publicado para todos os alunos`
    }

    if (destino === 'TURMA') {
        const turmas = rascunho.conteudo?.materializado_turmas || []
        return `${base} · Direcionado a ${turmas.length} turma(s): ${turmas.map(t => t.nome).join(', ')}`
    }

    return `${base} · Rascunho interno (ainda não distribuído)`
}

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

function renderProva(contrato) {
    if (!contrato) return ''

    const questoes = (contrato.questoes || []).map((questao, i) => `
        <li style="margin:6px 0">
            <strong>${i + 1}. ${escapeHTML(questao.enunciado)}</strong>
            <div style="opacity:.8;font-size:.9em">${escapeHTML(questao.justificativa || '')}</div>
        </li>
    `).join('')

    return `
        <div class="pnl" style="margin-top:18px">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-file-circle-check"></i> Prova gerada — revisão obrigatória</div></div>
            <div style="padding:14px">
                <h3 style="margin:0 0 8px">${escapeHTML(contrato.titulo)}</h3>
                <p>${escapeHTML(contrato.descricao || '')}</p>
                <p><strong>Questões:</strong> ${(contrato.questoes || []).length}</p>
                <ol>${questoes}</ol>
                <p style="opacity:.75;font-size:.9em">
                    O gabarito fica no rascunho e não é exibido ao aluno antes da materialização.
                </p>
                <div id="tutorRevisaoSlot" style="margin-top:16px"></div>
            </div>
        </div>
    `
}

function renderResultado(contrato) {
    return contrato && Array.isArray(contrato.questoes)
        ? renderProva(contrato)
        : renderEmenta(contrato)
}

function renderRascunhos() {
    if (!rascunhos.length) return estadoVazio('Nenhum rascunho ainda. Crie o primeiro acima.')

    return rascunhos.map(r => {
        const conteudo = r.conteudo || {}
        const status = statusRascunho(r)

        return `
            <div class="pnl" style="margin:10px 0">
                <div class="pnl-h">
                    <div class="pnl-t">${escapeHTML(r.titulo)} <small>(${escapeHTML(r.tipo)})</small></div>
                </div>
                <div style="padding:12px">
                    <p style="opacity:.85">${escapeHTML(conteudo.descricao || '')}</p>
                    <p><strong>Status:</strong> ${escapeHTML(status)}</p>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        ${r.materializado_tipo ? `
                            <button class="btn btn-sm" onclick="window.tutorAbrirDistribuir('${r.id}')">
                                <i class="fas fa-paper-plane"></i> Ajustar distribuição
                            </button>
                            <button class="btn btn-sm" onclick="window.tutorPublicarDireto('${r.id}', ${rascunhoPublico(r) ? 'false' : 'true'})">
                                <i class="fas ${rascunhoPublico(r) ? 'fa-eye-slash' : 'fa-globe'}"></i>
                                ${rascunhoPublico(r) ? 'Tornar privado' : 'Publicar para todos'}
                            </button>
                        ` : ''}
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

    h += `
        <div class="pnl" style="margin-bottom:16px">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-circle-info"></i> Como o conteúdo chega ao aluno</div></div>
            <div style="padding:12px 14px;font-size:13px;line-height:1.6">
                <ol style="margin:0;padding-left:20px">
                    <li><strong>Gerar</strong>: você informa assunto e tipo; o Tutor cria a ementa como rascunho.</li>
                    <li><strong>Revisar</strong>: aprovar não publica nada — é só a autorização para continuar.</li>
                    <li><strong>Materializar</strong>: escolha a NR, o formato (videoaula/material) e <strong>para onde vai</strong>.</li>
                    <li><strong>Distribuir</strong>:
                        <span style="color:var(--ok,#3a3)">Turma/trilha/aluno individual</span> aparece em <strong>Meus Cursos / Trilhas</strong>;
                        <span style="color:var(--ok,#3a3)">Publicar para todos</span> coloca o item no catálogo da NR.
                    </li>
                </ol>
                <p style="margin:8px 0 0;opacity:.8">
                    O "curso" da SulSafe é a NR: a ementa gerada fica anexada à descrição do conteúdo materializado.
                </p>
            </div>
        </div>
    `

    h += `<div class="pnl"><div class="pnl-h"><div class="pnl-t"><i class="fas fa-plus"></i> Novo conteúdo</div></div><div style="padding:14px">`
    h += `<form id="tutorForm" onsubmit="window.tutorGerar(event)">`
    h += `<label><strong>Tipo</strong><br>
        <select id="tutorTipo" name="tipo" style="min-width:220px;margin:6px 0 12px" onchange="window.tutorAlternarQuantidade()">
            <option value="${TIPOS_TUTOR.MATERIA}">${TITULOS_TIPO.MATERIA}</option>
            <option value="${TIPOS_TUTOR.CURSO}" selected>${TITULOS_TIPO.CURSO}</option>
            <option value="${TIPOS_TUTOR.PALESTRA}">${TITULOS_TIPO.PALESTRA}</option>
            <option value="PROVA">${TITULOS_TIPO.PROVA}</option>
        </select></label><br>`
    h += `<div id="tutorQuantidadeSlot" style="display:none;margin:0 0 12px">
        <label><strong>Quantidade de questões</strong><br>
            <select id="tutorQuantidadeQuestoes" name="quantidadeQuestoes" style="min-width:220px;margin:6px 0">
                <option value="5">5 questões</option>
                <option value="10" selected>10 questões</option>
                <option value="20">20 questões</option>
                <option value="30">30 questões</option>
                <option value="50">50 questões</option>
            </select></label>
        <p style="opacity:.75;font-size:.9em;margin:0">Limite de segurança: 50 questões por prova.</p>
    </div>`
    h += `<label><strong>Assunto</strong><br>
        <textarea id="tutorAssunto" name="assunto" rows="3" maxlength="4000"
            placeholder="Ex.: Crie um curso sobre NR 35 para novos colaboradores"
            style="width:100%;margin:6px 0" oninput="window.tutorAtualizarNR()"></textarea></label>`
    h += `<p id="tutorNRContexto" style="opacity:.75;font-size:.9em">NRs detectadas: ${escapeHTML(contextoNR)}</p>`
    h += `<label><strong>Público-alvo (opcional)</strong><br>
        <input id="tutorPublico" name="publico" maxlength="300" placeholder="Ex.: Colaboradores da obra" style="width:100%;margin:6px 0 14px"></label>`
    h += `<button class="btn btn-p" id="tutorBtnGerar" type="submit"><i class="fas fa-wand-magic-sparkles"></i> Criar com o TUTOR-Sulsafe</button>`
    h += `</form><div id="tutorErro"></div><div id="tutorAvisoConfig"></div></div></div>`

    h += `<div id="tutorEmentaSlot">${ultimoResultado ? renderResultado(ultimoResultado.contrato) : ''}</div>`
    h += `<h3 style="margin-top:24px"><i class="fas fa-clock-rotate-left"></i> Rascunhos recentes</h3>`
    h += `<div id="tutorListaSlot">${renderRascunhos()}</div>`

    // Carrega a lista em background sem bloquear o primeiro render.
    tutorAlternarQuantidade()
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

export function tutorAlternarQuantidade() {
    const slot = $('#tutorQuantidadeSlot')
    if (!slot) return
    slot.style.display = $('#tutorTipo')?.value === TIPO_TUTOR_PROVA ? '' : 'none'
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

    let quantidadeQuestoes = null
    if (tipo === TIPO_TUTOR_PROVA) {
        try {
            quantidadeQuestoes = normalizarQuantidadeQuestoes($('#tutorQuantidadeQuestoes')?.value)
        } catch (erro) {
            if (erroSlot) erroSlot.innerHTML = `<p style="color:var(--err,#e44)">${escapeHTML(erro.message)}</p>`
            return
        }
        if (!QUANTIDADES_PROVA_PERMITIDAS.includes(quantidadeQuestoes)) {
            if (erroSlot) erroSlot.innerHTML = `<p style="color:var(--err,#e44)">Escolha uma quantidade de 5 a 50 questões (padrão: ${QUANTIDADE_QUESTOES_PADRAO}).</p>`
            return
        }
    }

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
        const prompt = tipo === TIPO_TUTOR_PROVA
            ? montarPromptBaseFase5({ assunto, tipo, publicoAlvo })
            : montarPromptTutor({ assunto, tipo, publicoAlvo })

        const { data: jobId, error: erroJob } = await sbCriarJobTutor({
            titulo,
            prompt,
            tipo,
            provedor: null,
            quantidadeQuestoes: tipo === TIPO_TUTOR_PROVA ? quantidadeQuestoes : null
        })
        if (erroJob) throw erroJob

        const { data, error } = await sbGerarComTutor(jobId)
        if (error) throw error

        ultimoResultado = data
        const slot = $('#tutorEmentaSlot')
        if (slot) slot.innerHTML = renderResultado(data.contrato)

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
        window.toast?.(tipo === TIPO_TUTOR_PROVA
            ? 'Prova gerada. Revise antes de aprovar.'
            : 'Ementa gerada. Revise antes de aprovar.', 'success')

        // Integração da Etapa 5.2: o resultado do Tutor passa a ser gerenciado
        // dentro da Área do Professor, na aba correspondente ao tipo gerado.
        if (tipo === TIPO_TUTOR_PROVA) {
            nav('professor', { tab: 'provasIa' })
        } else if (tipo === TIPOS_TUTOR.PALESTRA) {
            nav('professor', { tab: 'palestras' })
        }
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

async function executarRevisao(conteudoId, decisao, observacao = null) {
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

export async function tutorRevisar(conteudoId, decisao) {
    if (!permitido()) return

    if (decisao === 'REJEITAR') {
        const slot = $('#tutorRevisaoSlot') || $(`#tutorMatSlot-${conteudoId}`)
        if (!slot) return

        slot.innerHTML = `
            <form onsubmit="window.tutorConfirmarRejeicao(event, '${conteudoId}')"
                  style="margin-top:10px;padding:10px;border:1px solid var(--line,#444);border-radius:8px">
                <label style="font-size:12px"><strong>Motivo da rejeição</strong> (mínimo 3 caracteres)<br>
                    <textarea id="tutorMotivoRejeicao-${conteudoId}" rows="2" maxlength="500"
                              style="width:100%;margin-top:4px"></textarea>
                </label>
                <div style="display:flex;gap:8px;margin-top:8px">
                    <button class="btn btn-sm" type="submit"><i class="fas fa-xmark"></i> Confirmar rejeição</button>
                    <button class="btn btn-sm" type="button"
                            onclick="window.tutorCancelarRejeicao('${conteudoId}')">Cancelar</button>
                </div>
            </form>
        `
        return
    }

    return executarRevisao(conteudoId, decisao)
}

export async function tutorConfirmarRejeicao(event, conteudoId) {
    event?.preventDefault()
    if (!permitido()) return

    const motivo = $(`#tutorMotivoRejeicao-${conteudoId}`)?.value?.trim() || ''
    if (motivo.length < 3) {
        window.toast?.('Informe o motivo da rejeição (mínimo 3 caracteres).', 'warn')
        return
    }

    return executarRevisao(conteudoId, 'REJEITAR', motivo)
}

export function tutorCancelarRejeicao(conteudoId) {
    const slot = $('#tutorRevisaoSlot') || $(`#tutorMatSlot-${conteudoId}`)
    if (slot) slot.innerHTML = ''
}

function modeloDistribuicao(rascunho) {
    if (rascunhoPublico(rascunho)) return 'GLOBAL'
    if (rascunho?.conteudo?.materializado_destino === 'TURMA') return 'TURMA'
    return 'INTERNO'
}

function listaTurmasTutor() {
    if (!turmasTutorCache.length) {
        return `<p style="font-size:12px;color:var(--warn,#d90);margin:4px 0">
            Nenhuma turma/trilha encontrada. Crie uma em <strong>Professor → Turmas/Trilhas</strong>
            para direcionar o conteúdo a alunos específicos.
        </p>`
    }

    return turmasTutorCache.map(turma => `
        <label style="display:flex;align-items:center;gap:8px;padding:7px 4px;font-size:13px;cursor:pointer">
            <input type="checkbox" class="tutorMatTurma" value="${escapeHTML(String(turma.id))}" style="width:auto">
            <span style="flex:1">${escapeHTML(turma.nome || 'Turma')}</span>
            <span class="badge" style="background:var(--bd);color:var(--tx3)">
                ${escapeHTML(TIPOS_TURMA[turma.tipo] || turma.tipo || 'Turma')}
            </span>
        </label>
    `).join('')
}

async function abrirPainelDistribuicao(conteudoId, modo) {
    if (!permitido()) return

    const slot = $(`#tutorMatSlot-${conteudoId}`)
    if (!slot) return

    slot.innerHTML = `<p style="font-size:13px;opacity:.8">
        <i class="fas fa-spinner fa-spin"></i> Carregando turmas e trilhas...
    </p>`

    const { data, error } = await sbGetTurmas()
    if (error) {
        slot.innerHTML = `<p style="color:var(--err,#e44);font-size:13px">
            Não foi possível carregar as turmas: ${escapeHTML(error.message || 'Erro desconhecido')}
        </p>`
        return
    }

    turmasTutorCache = data || []
    const rascunho = rascunhos.find(item => item.id === conteudoId)
    const detectadas = extrairNRsDoAssunto(rascunho?.titulo || '')
    const nrSugerida = detectadas[0]?.numero || 35
    const selecionada = modeloDistribuicao(rascunho)
    const jaMaterializado = modo === 'DISTRIBUIR'

    slot.innerHTML = `
        <form id="tutorMatForm-${conteudoId}"
              onsubmit="window.tutorConfirmarMaterializar(event, '${conteudoId}')"
              style="margin-top:12px;padding:12px;border:1px solid var(--line,#444);border-radius:8px">
            <input type="hidden" id="tutorMatModo-${conteudoId}" value="${modo}">

            ${jaMaterializado ? `
                <p style="font-size:12px;opacity:.8;margin:0 0 10px">
                    Este conteúdo já foi materializado. Escolha apenas a distribuição.
                </p>
            ` : `
                <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
                    <label style="font-size:12px">NR de destino
                        <input type="number" id="tutorMatNr-${conteudoId}" value="${nrSugerida}" min="1" max="38"
                               style="width:80px;margin-left:4px">
                    </label>
                    <label style="font-size:12px">Formato
                        <select id="tutorMatTipo-${conteudoId}" onchange="window.tutorAlternarMaterializar('${conteudoId}')"
                                style="margin-left:4px">
                            <option value="VIDEOAULA">Videoaula</option>
                            <option value="MATERIAL">Material de apoio</option>
                        </select>
                    </label>
                </div>
                <div id="tutorMatUrlWrap-${conteudoId}" style="display:none;margin-bottom:10px">
                    <label style="font-size:12px">URL do material (https://)<br>
                        <input type="url" id="tutorMatUrl-${conteudoId}" placeholder="https://exemplo.com/material.pdf"
                               style="width:100%;margin-top:4px">
                    </label>
                </div>
            `}

            <label style="font-size:12px"><strong>Para onde vai?</strong><br>
                <select id="tutorMatDistribuicao-${conteudoId}"
                        onchange="window.tutorAlternarDistribuicao('${conteudoId}')"
                        style="width:100%;margin-top:4px">
                    <option value="TURMA" ${selecionada === 'TURMA' ? 'selected' : ''}>
                        Turma, trilha ou aluno individual
                    </option>
                    <option value="GLOBAL" ${selecionada === 'GLOBAL' ? 'selected' : ''}>
                        Todos os alunos (catálogo da NR)
                    </option>
                    <option value="INTERNO" ${selecionada === 'INTERNO' ? 'selected' : ''}>
                        Só salvar como rascunho interno
                    </option>
                </select>
            </label>

            <div id="tutorMatTurmasWrap-${conteudoId}"
                 style="display:none;margin-top:8px;max-height:190px;overflow:auto;border:1px solid var(--line,#444);border-radius:6px;padding:6px">
                ${listaTurmasTutor()}
            </div>

            <p id="tutorMatAjuda-${conteudoId}" style="font-size:12px;opacity:.8;margin:8px 0"></p>
            <div id="tutorMatErro-${conteudoId}"></div>

            <button class="btn btn-sm btn-p" id="tutorMatBtn-${conteudoId}" type="submit">
                <i class="fas fa-paper-plane"></i> ${jaMaterializado ? 'Salvar distribuição' : 'Criar e distribuir'}
            </button>
        </form>
    `

    if (!jaMaterializado) tutorAlternarMaterializar(conteudoId)
    tutorAlternarDistribuicao(conteudoId)
}

export function tutorAbrirMaterializar(conteudoId) {
    return abrirPainelDistribuicao(conteudoId, 'MATERIALIZAR')
}

export function tutorAbrirDistribuir(conteudoId) {
    return abrirPainelDistribuicao(conteudoId, 'DISTRIBUIR')
}

export function tutorAlternarMaterializar(conteudoId) {
    const tipo = $(`#tutorMatTipo-${conteudoId}`)?.value
    const wrap = $(`#tutorMatUrlWrap-${conteudoId}`)
    if (wrap) wrap.style.display = tipo === 'MATERIAL' ? 'block' : 'none'

    const url = $(`#tutorMatUrl-${conteudoId}`)
    if (url) url.required = tipo === 'MATERIAL'
}

export function tutorAlternarDistribuicao(conteudoId) {
    const distribuicao = $(`#tutorMatDistribuicao-${conteudoId}`)?.value
    const wrap = $(`#tutorMatTurmasWrap-${conteudoId}`)
    if (wrap) wrap.style.display = distribuicao === 'TURMA' ? 'block' : 'none'

    const ajuda = $(`#tutorMatAjuda-${conteudoId}`)
    if (ajuda) {
        ajuda.textContent = distribuicao === 'TURMA'
            ? 'Os alunos inscritos nas turmas/trilhas marcadas verão o conteúdo em Meus Cursos / Trilhas.'
            : distribuicao === 'GLOBAL'
                ? 'O conteúdo ficará visível para todos os alunos no catálogo da NR.'
                : 'O conteúdo ficará salvo apenas para ADMIN/PROFESSOR. Você poderá distribuí-lo depois.'
    }

    const botao = $(`#tutorMatBtn-${conteudoId}`)
    if (botao) {
        const modo = $(`#tutorMatModo-${conteudoId}`)?.value
        const verbo = modo === 'DISTRIBUIR' ? 'Salvar distribuição' : 'Criar e distribuir'
        botao.innerHTML = `<i class="fas fa-paper-plane"></i> ${
            distribuicao === 'GLOBAL' ? `${verbo} · publicar para todos` : verbo
        }`
    }
}

export async function tutorConfirmarMaterializar(event, conteudoId) {
    event?.preventDefault()
    if (!permitido()) return

    const modo = $(`#tutorMatModo-${conteudoId}`)?.value || 'MATERIALIZAR'
    const distribuicao = $(`#tutorMatDistribuicao-${conteudoId}`)?.value
    const erroSlot = $(`#tutorMatErro-${conteudoId}`)
    const botao = $(`#tutorMatBtn-${conteudoId}`)
    const slot = $(`#tutorMatSlot-${conteudoId}`)

    if (erroSlot) erroSlot.innerHTML = ''

    let nr = null
    let tipo = null
    let url = null

    if (modo === 'MATERIALIZAR') {
        nr = Number($(`#tutorMatNr-${conteudoId}`)?.value)
        tipo = $(`#tutorMatTipo-${conteudoId}`)?.value
        url = $(`#tutorMatUrl-${conteudoId}`)?.value?.trim() || null

        if (!Number.isInteger(nr) || nr < 1 || nr > 38) {
            if (erroSlot) erroSlot.innerHTML = `<p style="color:var(--err,#e44);font-size:12px">Informe uma NR válida (1 a 38).</p>`
            return
        }
        if (tipo === 'MATERIAL' && !/^https:\/\//i.test(url || '')) {
            if (erroSlot) erroSlot.innerHTML = `<p style="color:var(--err,#e44);font-size:12px">Material requer uma URL https://.</p>`
            return
        }
    }

    const turmaIds = distribuicao === 'TURMA'
        ? Array.from(document.querySelectorAll(`#tutorMatTurmasWrap-${conteudoId} .tutorMatTurma:checked`))
            .map(input => input.value)
        : []

    if (distribuicao === 'TURMA' && turmaIds.length === 0) {
        if (erroSlot) erroSlot.innerHTML = `<p style="color:var(--err,#e44);font-size:12px">Selecione ao menos uma turma/trilha.</p>`
        return
    }

    if (botao) {
        botao.disabled = true
        botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'
    }

    try {
        if (modo === 'MATERIALIZAR') {
            const materializado = await sbMaterializarRascunhoTutor({
                conteudoId, nrId: nr, destino: tipo, url
            })
            if (materializado.error) throw materializado.error
        }

        if (distribuicao === 'TURMA') {
            const direcionado = await sbDirecionarConteudoTutor(conteudoId, turmaIds)
            if (direcionado.error) throw direcionado.error
        } else if (distribuicao === 'GLOBAL') {
            const publicado = await sbPublicarConteudoTutor(conteudoId, true)
            if (publicado.error) throw publicado.error
        }

        const nomes = turmasTutorCache
            .filter(turma => turmaIds.includes(String(turma.id)))
            .map(turma => turma.nome)

        let mensagem
        if (distribuicao === 'TURMA') {
            mensagem = `Conteúdo disponível para: ${nomes.join(', ')}. Os alunos inscritos verão em Meus Cursos / Trilhas.`
        } else if (distribuicao === 'GLOBAL') {
            mensagem = `Conteúdo publicado no catálogo da NR ${nr ?? ''}. Todos os alunos poderão acessá-lo.`
        } else {
            mensagem = 'Conteúdo salvo como rascunho interno. Use "Ajustar distribuição" quando quiser enviá-lo aos alunos.'
        }

        if (slot) {
            slot.innerHTML = `<p style="color:var(--ok,#3a3);font-size:13px">
                <i class="fas fa-check-circle"></i> ${escapeHTML(mensagem)}
            </p>`
        }

        await carregarRascunhos()
        window.toast?.('Distribuição salva.', 'success')
    } catch (error) {
        handleError(error)
        if (erroSlot) {
            erroSlot.innerHTML = `<p style="color:var(--err,#e44);font-size:12px">
                ${escapeHTML(error?.message || 'Falha ao salvar a distribuição.')}
            </p>`
        }
    } finally {
        if (botao) {
            botao.disabled = false
            tutorAlternarDistribuicao(conteudoId)
        }
    }
}

export async function tutorPublicarDireto(conteudoId, publico) {
    if (!permitido()) return

    const { error } = await sbPublicarConteudoTutor(conteudoId, publico)
    if (error) return handleError(error)

    window.toast?.(publico ? 'Conteúdo publicado para todos.' : 'Conteúdo voltou a ser privado.', 'success')
    await carregarRascunhos()
}

// Exposições globais usadas pelos templates inline (padrão do projeto).
window.vTutor = vTutor
window.tutorGerar = tutorGerar
window.tutorAtualizarNR = tutorAtualizarNR
window.tutorAlternarQuantidade = tutorAlternarQuantidade
window.tutorRevisar = tutorRevisar
window.tutorConfirmarRejeicao = tutorConfirmarRejeicao
window.tutorCancelarRejeicao = tutorCancelarRejeicao
window.tutorAbrirMaterializar = tutorAbrirMaterializar
window.tutorAbrirDistribuir = tutorAbrirDistribuir
window.tutorAlternarMaterializar = tutorAlternarMaterializar
window.tutorAlternarDistribuicao = tutorAlternarDistribuicao
window.tutorConfirmarMaterializar = tutorConfirmarMaterializar
window.tutorPublicarDireto = tutorPublicarDireto
