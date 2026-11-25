// ============================================================
// VIEW: PALESTRAS NA ÁREA DO PROFESSOR (FASE 5.2)
// ============================================================
// Uma única tela para criar palestras manualmente ou a partir de um
// rascunho aprovado do TUTOR-SulSafe, revisar (HITL) e escolher o
// destino. Aprovar nunca entrega: distribuição é um ato separado.
// "Uso Pessoal" (INTERNO) não cria vínculo nem notificação.
// ============================================================

import { isAdmin, isProf } from '../state.js'
import {
    sbCriarPalestraManual,
    sbCriarPalestraIA,
    sbAprovarPalestra,
    sbDistribuirPalestra,
    sbListarPalestrasProfessor,
    sbListarRascunhosTutor,
    sbListarDestinosDistribuicaoIA
} from '../supabase-client.js'
import { toast, handleError, openMdl, closeMdl, sanitizar, $ } from '../utils.js'
import {
    DESTINOS_PALESTRA,
    rotuloDestinoPalestra,
    renderPalestrasProfessorHtml,
    renderRascunhosPalestraHtml
} from '../palestras-core.js'

let palestrasCache = []
let destinosCache = { turmas: [], alunos: [] }
let ouvinteTeclado = null

function permitido() {
    return isAdmin() || isProf()
}

export function htmlPalestrasProfessor() {
    return `
        <div class="pnl" style="margin-bottom:16px">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-plus-circle"></i> Criar palestra manualmente</div></div>
            <form id="formPalestraManual" aria-label="Criar palestra manualmente">
                <div class="fld">
                    <label for="palestraTitulo">Título *</label>
                    <input type="text" id="palestraTitulo" maxlength="160" required
                           placeholder="Ex: Trabalho em altura — NR 35">
                </div>
                <div class="fld">
                    <label for="palestraDescricao">Descrição</label>
                    <textarea id="palestraDescricao" rows="2" maxlength="1000"
                              placeholder="Resumo do conteúdo da palestra"></textarea>
                </div>
                <div class="fld" style="display:flex;gap:12px;flex-wrap:wrap">
                    <label for="palestraPublico" style="flex:1;min-width:180px">Público-alvo
                        <input type="text" id="palestraPublico" maxlength="120" placeholder="Ex: Alunos da empresa">
                    </label>
                    <label for="palestraDuracao" style="width:140px">Duração (min)
                        <input type="number" id="palestraDuracao" min="1" max="600" placeholder="30">
                    </label>
                </div>
                <div class="fld">
                    <label for="palestraRoteiro">Roteiro (um bloco por linha: bloco|minutos|conteúdo)</label>
                    <textarea id="palestraRoteiro" rows="3"
                              placeholder="Abertura|5|Boas-vindas e objetivo&#10;Desenvolvimento|20|Conteúdo principal"></textarea>
                </div>
                <button type="submit" class="btn btn-p" style="width:auto;flex:none">
                    <i class="fas fa-save"></i> Salvar palestra
                </button>
            </form>
        </div>

        <div class="pnl" style="margin-bottom:16px">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-wand-magic-sparkles"></i> Rascunhos do TUTOR-SulSafe</div></div>
            <p style="font-size:13px;color:var(--tx2);margin-bottom:12px">
                Rascunhos de palestra aprovados no Tutor aparecem aqui para virarem palestras revisáveis.
            </p>
            <div id="listaRascunhosPalestraIA" aria-live="polite">
                <div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando rascunhos...</p></div>
            </div>
        </div>

        <div class="pnl">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-microphone"></i> Palestras cadastradas</div></div>
            <div id="listaPalestrasProfessor" aria-live="polite">
                <div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando palestras...</p></div>
            </div>
        </div>
    `
}

export function iniciarPalestrasProfessor() {
    if (!permitido()) return

    const raiz = $('#profTabPalestras')
    if (!raiz || raiz.dataset.iniciado === '1') return
    raiz.dataset.iniciado = '1'

    raiz.addEventListener('submit', async (evento) => {
        if (evento.target?.id !== 'formPalestraManual') return
        evento.preventDefault()
        await criarManual(evento.target)
    })

    raiz.addEventListener('click', async (evento) => {
        const botao = evento.target.closest('[data-acao]')
        if (!botao || !raiz.contains(botao) || botao.disabled) return

        const acao = botao.dataset.acao
        if (acao === 'criar-ia') return criarDaIA(botao.dataset.id, botao)
        if (acao === 'aprovar') return aprovar(botao.dataset.id, botao)
        if (acao === 'distribuir') return abrirDistribuicao(botao.dataset.id, botao.dataset.titulo)
    })

    carregarPalestras()
    carregarRascunhos()
}

async function criarManual(formulario) {
    const titulo = String($('#palestraTitulo')?.value || '').trim()
    const descricao = String($('#palestraDescricao')?.value || '').trim()
    const publicoAlvo = String($('#palestraPublico')?.value || '').trim()
    const duracaoBruta = String($('#palestraDuracao')?.value || '').trim()
    const duracaoMin = duracaoBruta ? Number(duracaoBruta) : null
    const btn = formulario.querySelector('[type="submit"]')

    if (!titulo) {
        toast('Informe o título da palestra.', 'warn')
        return
    }
    if (duracaoMin !== null && (!Number.isInteger(duracaoMin) || duracaoMin < 1 || duracaoMin > 600)) {
        toast('Informe uma duração entre 1 e 600 minutos.', 'warn')
        return
    }

    const roteiro = String($('#palestraRoteiro')?.value || '')
        .split('\n')
        .map(linha => linha.trim())
        .filter(Boolean)
        .slice(0, 40)
        .map(linha => {
            const [bloco, minutos, ...resto] = linha.split('|')
            return {
                bloco: (bloco || 'Bloco').trim().slice(0, 120),
                minutos: Number.isFinite(Number(minutos)) ? Number(minutos) : 0,
                conteudo: resto.join('|').trim().slice(0, 1000)
            }
        })

    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...' }
    const { error } = await sbCriarPalestraManual({
        titulo, descricao, publicoAlvo, duracaoMin, roteiro
    })
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Salvar palestra' }

    if (error) return handleError(error)
    toast('Palestra salva. Revise e aprove antes de distribuir.', 'success')
    formulario.reset()
    await carregarPalestras()
}

async function criarDaIA(conteudoId, botao) {
    if (!conteudoId) return
    botao.disabled = true
    const { error } = await sbCriarPalestraIA(conteudoId)
    if (error) {
        botao.disabled = false
        return handleError(error)
    }
    toast('Palestra da I.A. criada e aguardando sua aprovação.', 'success')
    await Promise.all([carregarPalestras(), carregarRascunhos()])
}

async function aprovar(palestraId, botao) {
    if (!palestraId) return
    botao.disabled = true
    const { error } = await sbAprovarPalestra(palestraId)
    if (error) {
        botao.disabled = false
        return handleError(error)
    }
    toast('Palestra aprovada — pronta para distribuir.', 'success')
    await carregarPalestras()
}

async function carregarPalestras() {
    const container = $('#listaPalestrasProfessor')
    if (!container) return
    container.innerHTML = '<div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando palestras...</p></div>'

    const { data, error } = await sbListarPalestrasProfessor()
    if (!container.isConnected) return
    if (error) {
        container.innerHTML = `<div class="empty" role="alert"><i class="fas fa-triangle-exclamation"></i><p>${sanitizar(error.message || 'Não foi possível carregar as palestras.')}</p></div>`
        return
    }
    palestrasCache = Array.isArray(data) ? data : []
    container.innerHTML = renderPalestrasProfessorHtml(palestrasCache)
}

async function carregarRascunhos() {
    const container = $('#listaRascunhosPalestraIA')
    if (!container) return

    const { data, error } = await sbListarRascunhosTutor()
    if (!container.isConnected) return
    if (error) {
        container.innerHTML = `<div class="empty" role="alert"><i class="fas fa-triangle-exclamation"></i><p>${sanitizar(error.message || 'Não foi possível carregar os rascunhos.')}</p></div>`
        return
    }

    const rascunhos = (Array.isArray(data) ? data : []).filter(rascunho =>
        rascunho?.tipo === 'PALESTRA' && rascunho?.aprovado && !rascunho?.rejeitado
    )
    container.innerHTML = renderRascunhosPalestraHtml(rascunhos)
}

async function abrirDistribuicao(palestraId, titulo) {
    if (!palestraId) return

    if (!destinosCache.turmas.length && !destinosCache.alunos.length) {
        const { data, error } = await sbListarDestinosDistribuicaoIA()
        if (error) return handleError(error)
        destinosCache = {
            turmas: Array.isArray(data?.turmas) ? data.turmas : [],
            alunos: Array.isArray(data?.alunos) ? data.alunos : []
        }
    }

    const opcoesTurma = destinosCache.turmas.map(turma => `
        <option value="${sanitizar(turma.id)}">${sanitizar(turma.nome || 'Turma')} (${sanitizar(String(turma.quantidade_alunos ?? 0))} alunos)</option>
    `).join('')
    const opcoesAluno = destinosCache.alunos.map(aluno => `
        <option value="${sanitizar(aluno.id)}">${sanitizar(aluno.nome || 'Aluno')}</option>
    `).join('')

    const modal = openMdl(`
        <button type="button" class="mdl-x" data-acao="fechar" aria-label="Fechar distribuição"><i class="fas fa-times"></i></button>
        <div class="god-hd" style="margin-bottom:16px">
            <h2 id="tituloDistribuicaoPalestra" style="font-size:20px"><i class="fas fa-paper-plane"></i> Distribuir palestra</h2>
            <p>${sanitizar(titulo || 'Palestra aprovada')}</p>
        </div>
        <form id="formDistribuicaoPalestra">
            <fieldset style="border:1px solid var(--bd);border-radius:var(--r);padding:14px">
                <legend style="font-size:13px;font-weight:700;padding:0 6px">Destino da palestra</legend>
                ${DESTINOS_PALESTRA.map((destino, indice) => `
                    <label style="display:block;margin:8px 0;font-size:13px">
                        <input type="radio" name="destino" value="${sanitizar(destino)}" ${indice === 0 ? 'checked' : ''}>
                        ${sanitizar(rotuloDestinoPalestra(destino))}
                    </label>
                `).join('')}
                <label style="display:block;margin:8px 0 18px 20px;font-size:13px">
                    Selecionar turma
                    <select name="turma_id" style="display:block;width:100%;margin-top:4px;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:10px;color:var(--tx)">
                        ${opcoesTurma || '<option value="">Nenhuma turma disponível</option>'}
                    </select>
                </label>
                <label style="display:block;margin:8px 0 18px 20px;font-size:13px">
                    Selecionar aluno
                    <select name="aluno_id" style="display:block;width:100%;margin-top:4px;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:10px;color:var(--tx)">
                        ${opcoesAluno || '<option value="">Nenhum aluno disponível</option>'}
                    </select>
                </label>
            </fieldset>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
                <button type="submit" class="btn btn-p"><i class="fas fa-check"></i> Confirmar distribuição</button>
                <button type="button" class="btn" data-acao="fechar" style="background:transparent;border:1px solid var(--bd)">Cancelar</button>
            </div>
        </form>
    `, { maxWidth: '680px' })

    const caixa = modal?.firstElementChild
    if (caixa) {
        caixa.setAttribute('role', 'dialog')
        caixa.setAttribute('aria-modal', 'true')
        caixa.setAttribute('aria-labelledby', 'tituloDistribuicaoPalestra')
    }

    const fecharComEscape = (evento) => {
        if (evento.key === 'Escape') fechar()
    }
    ouvinteTeclado = fecharComEscape
    document.addEventListener('keydown', fecharComEscape)

    function fechar() {
        if (ouvinteTeclado) {
            document.removeEventListener('keydown', ouvinteTeclado)
            ouvinteTeclado = null
        }
        closeMdl()
    }

    // openMdl reaproveita #mdlGlobal. Listeners acumulados disparariam ações
    // de aberturas anteriores; handlers de propriedade substituem o anterior.
    modal.onclick = (evento) => {
        if (evento.target.closest('[data-acao="fechar"]')) fechar()
    }

    modal.onsubmit = async (evento) => {
        evento.preventDefault()
        const formulario = evento.target
        const destinoTipo = String(formulario.elements.destino?.value || '').toUpperCase()
        if (!DESTINOS_PALESTRA.includes(destinoTipo)) {
            toast('Escolha um destino válido.', 'err')
            return
        }

        let destinoId = null
        if (destinoTipo === 'TURMA') destinoId = formulario.elements.turma_id?.value || null
        if (destinoTipo === 'ALUNO') destinoId = formulario.elements.aluno_id?.value || null
        if (['TURMA', 'ALUNO'].includes(destinoTipo) && !destinoId) {
            toast('Selecione um destino válido.', 'err')
            return
        }

        const botao = formulario.querySelector('[type="submit"]')
        if (botao) botao.disabled = true
        const { data: total, error } = await sbDistribuirPalestra({ palestraId, destinoTipo, destinoId })
        if (botao) botao.disabled = false
        if (error) return handleError(error)

        toast(destinoTipo === 'INTERNO'
            ? 'Palestra marcada como Uso Pessoal — nada foi entregue.'
            : `Palestra distribuída para ${Number(total) || 0} aluno(s).`,
        'success')
        fechar()
        await carregarPalestras()
    }

    modal.querySelector('[data-acao="fechar"]')?.focus()
}
