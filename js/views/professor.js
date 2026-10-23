// ============================================================
// VIEW: ÁREA DO PROFESSOR
// ============================================================
import { S, NRS, nav, uid, isAdmin, isProf } from '../state.js'
import {
    sbCriarVideoaula,
    sbCriarMaterial,
    sbCriarSala,
    sbUploadArquivo,
    STORAGE_BUCKET,
    sbGetTurmas,
    sbCriarTurma,
    sbExcluirTurma,
    sbGetAlunos,
    sbGetTurmaAlunos,
    sbAdicionarAlunoTurma,
    sbRemoverAlunoTurma,
    sbGetTurmaMateriais,
    sbVincularConteudoTurma,
    sbDesvincularConteudoTurma,
    sbGetMateriais,
    sbGetVideoaulas,
    sbCriarProvaDirecionada,
    sbGetProvasDirecionadasProfessor,
    sbExcluirProvaDirecionada,
    sbCriarNotificacao
} from '../supabase-client.js'
import { toast, sanitizar, openMdl, closeMdl, $, $$ } from '../utils.js'

let turmasProfCache = []
let alunosProfCache = []
let turmaAlunosProfCache = []
let turmaMateriaisProfCache = []
let conteudosDisponiveisCache = { materiais: [], videoaulas: [] }
let provasProfCache = []

const TIPO_TURMA = {
    turma: { label: 'Turma', icon: 'fa-users' },
    individual: { label: 'Individual', icon: 'fa-user' },
    atualizacao: { label: 'Atualização', icon: 'fa-rotate' }
}

export function vProfessor() {
    if (!isProf() && !isAdmin()) return window.nav('inicio')

    const optsNR = NRS.map(n => `<option value="${n.n}">NR ${n.n} — ${sanitizar(n.nome)}</option>`).join('')

    let h = `<div class="btn-back" onclick="window.nav('inicio')"><i class="fas fa-arrow-left"></i> Voltar</div>`
    h += `
    <div class="god-hd">
        <h2><i class="fas fa-chalkboard-user"></i> Área do Professor</h2>
        <p>Gerencie videoaulas, materiais, salas, turmas e provas — ${sanitizar(S.user?.nome_completo || '')}</p>
    </div>

    <div class="tabs" style="margin-bottom:24px;flex-wrap:wrap">
        <button class="tab-b on" onclick="switchProfTab('videoaulas', this)"><i class="fas fa-circle-play"></i> Videoaulas</button>
        <button class="tab-b" onclick="switchProfTab('materiais', this)"><i class="fas fa-file-pdf"></i> Materiais</button>
        <button class="tab-b" onclick="switchProfTab('salas', this)"><i class="fas fa-tower-broadcast"></i> Salas ao Vivo</button>
        <button class="tab-b" onclick="switchProfTab('turmas', this)"><i class="fas fa-users-gear"></i> Turmas/Trilhas</button>
        <button class="tab-b" onclick="switchProfTab('provas', this)"><i class="fas fa-file-signature"></i> Provas</button>
    </div>

    <!-- TAB VIDEOAULAS -->
    <div id="profTabVideoaulas" class="tab-c on">
        <div class="pnl">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-plus-circle"></i> Cadastrar Nova Videoaula</div></div>
            <form onsubmit="window.profSalvarVideoaula(event)">
                <div class="fld">
                    <label>Título da Videoaula *</label>
                    <input type="text" id="profVaTitulo" placeholder="Ex: Introdução à NR 35 — Trabalho em Altura" required>
                </div>
                <div class="fld">
                    <label>Norma Regulamentadora (NR) *</label>
                    <select id="profVaNr" required>
                        <option value="">Selecione a NR...</option>
                        ${optsNR}
                    </select>
                </div>
                <div class="fld">
                    <label>Link do YouTube *</label>
                    <input type="url" id="profVaLink" placeholder="https://youtube.com/watch?v=... ou https://youtu.be/..." required>
                </div>
                <div class="fld">
                    <label>Disponibilidade *</label>
                    <select id="profVaDisponibilidade" onchange="window.profToggleDestinoVa()">
                        <option value="global">Global — todos os alunos</option>
                        <option value="especifico">Específico — escolher turmas/trilhas</option>
                    </select>
                </div>
                <div class="fld" id="profVaTurmasWrap" style="display:none">
                    <label>Turmas que receberão esta videoaula</label>
                    <div id="profVaTurmas" class="almox-cat-lista" style="padding:8px">Carregando turmas...</div>
                </div>
                <div class="fld">
                    <label>Descrição / Ementa da Aula</label>
                    <textarea id="profVaDesc" rows="3" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:10px;font-size:13px;color:var(--tx);resize:vertical" placeholder="Descreva os tópicos abordados nesta videoaula..."></textarea>
                </div>
                <button type="submit" class="btn btn-p" style="width:auto;flex:none;" id="btnProfSalvarVa">
                    <i class="fas fa-save"></i> Publicar Videoaula
                </button>
            </form>
        </div>
    </div>

    <!-- TAB MATERIAIS -->
    <div id="profTabMateriais" class="tab-c">
        <div class="pnl">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-upload"></i> Upload de Material (PDF)</div></div>
            <form onsubmit="window.profUploadMaterial(event)">
                <div class="fld">
                    <label>Título do Material *</label>
                    <input type="text" id="profMatTitulo" placeholder="Ex: Apostila NR 35 — Completa" required>
                </div>
                <div class="fld">
                    <label>Norma Regulamentadora (NR) *</label>
                    <select id="profMatNr" required>
                        <option value="">Selecione a NR...</option>
                        ${optsNR}
                    </select>
                </div>
                <div class="fld">
                    <label>Arquivo PDF *</label>
                    <input type="file" id="profMatFile" accept=".pdf,.doc,.docx,.pptx" required style="padding:10px;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);width:100%;font-size:13px;color:var(--tx)">
                </div>
                <div class="fld">
                    <label>Disponibilidade *</label>
                    <select id="profMatDisponibilidade" onchange="window.profToggleDestinoMat()">
                        <option value="global">Global — todos os alunos</option>
                        <option value="especifico">Específico — escolher turmas/trilhas</option>
                    </select>
                </div>
                <div class="fld" id="profMatTurmasWrap" style="display:none">
                    <label>Turmas que receberão este material</label>
                    <div id="profMatTurmas" class="almox-cat-lista" style="padding:8px">Carregando turmas...</div>
                </div>
                <div class="fld">
                    <label>Descrição do Material</label>
                    <textarea id="profMatDesc" rows="2" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:10px;font-size:13px;color:var(--tx);resize:vertical" placeholder="Descreva brevemente o conteúdo deste material..."></textarea>
                </div>
                <div id="profUploadProgress" style="display:none;margin-bottom:12px">
                    <div class="prog-bar"><div class="prog-fill" id="profUploadBar" style="width:0%"></div></div>
                    <p style="font-size:12px;color:var(--tx3);margin-top:4px;text-align:center" id="profUploadTxt">Enviando arquivo...</p>
                </div>
                <button type="submit" class="btn btn-p" style="width:auto;flex:none;" id="btnProfUploadMat">
                    <i class="fas fa-cloud-upload-alt"></i> Enviar Material
                </button>
            </form>
        </div>
    </div>

    <!-- TAB SALAS -->
    <div id="profTabSalas" class="tab-c">
        <div class="pnl">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-video"></i> Criar Sala ao Vivo</div></div>
            <form onsubmit="window.profCriarSala(event)">
                <div class="fld">
                    <label>Tópico / Tema da Aula *</label>
                    <input type="text" id="profSalaTopico" placeholder="Ex: Revisão NR 35 — Dúvidas dos Alunos" required>
                </div>
                <div class="fld">
                    <label>Link do Google Meet *</label>
                    <input type="url" id="profSalaMeet" placeholder="https://meet.google.com/xxx-xxxx-xxx" required>
                </div>
                <button type="submit" class="btn btn-p" style="width:auto;flex:none;" id="btnProfCriarSala">
                    <i class="fas fa-broadcast-tower"></i> Abrir Sala ao Vivo
                </button>
            </form>
        </div>
    </div>

    <!-- TAB TURMAS / TRILHAS -->
    <div id="profTabTurmas" class="tab-c">
        <div class="pnl">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-users-gear"></i> Criar Turma / Trilha</div></div>
            <form onsubmit="window.profCriarTurma(event)">
                <div class="fld">
                    <label>Nome da turma/trilha *</label>
                    <input type="text" id="profTurmaNome" placeholder="Ex: Turma NR-35 Março, Atualização NR-10, João - Individual" required>
                </div>
                <div class="fld">
                    <label>Tipo *</label>
                    <select id="profTurmaTipo" required>
                        <option value="turma">Turma</option>
                        <option value="atualizacao">Atualização</option>
                        <option value="individual">Individual</option>
                    </select>
                </div>
                <div class="fld">
                    <label>Descrição</label>
                    <textarea id="profTurmaDesc" rows="2" placeholder="Objetivo da turma, período, observações..."></textarea>
                </div>
                <button type="submit" class="btn btn-p" style="width:auto;flex:none;" id="btnProfCriarTurma">
                    <i class="fas fa-plus"></i> Criar Turma
                </button>
            </form>
        </div>

        <div id="profTurmasLista">
            <div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando turmas...</p></div>
        </div>
        <datalist id="profAlunosDatalist"></datalist>
    </div>

    <!-- TAB PROVAS -->
    <div id="profTabProvas" class="tab-c">
        <div class="pnl">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-file-signature"></i> Criar Prova / Teste</div></div>
            <form onsubmit="window.profCriarProvaDirecionada(event)">
                <div class="fld">
                    <label>Título da prova/teste *</label>
                    <input type="text" id="profProvaTitulo" placeholder="Ex: Avaliação prática NR-35" required>
                </div>
                <div class="fld">
                    <label>Norma Regulamentadora (NR)</label>
                    <select id="profProvaNR">
                        <option value="">Sem NR específica</option>
                        ${optsNR}
                    </select>
                </div>
                <div class="fld">
                    <label>Tipo *</label>
                    <select id="profProvaTipo">
                        <option value="prova">Prova</option>
                        <option value="teste">Teste</option>
                    </select>
                </div>
                <div class="fld">
                    <label>Destino *</label>
                    <select id="profProvaDestinoTipo" onchange="window.profToggleAlvoProva()">
                        <option value="turma">Turma / Trilha</option>
                        <option value="aluno">Aluno específico</option>
                    </select>
                </div>
                <div class="fld" id="profProvaTurmaWrap">
                    <label>Turma / Trilha *</label>
                    <select id="profProvaTurma">
                        <option value="">Selecione a turma...</option>
                    </select>
                </div>
                <div class="fld" id="profProvaAlunoWrap" style="display:none">
                    <label>Aluno *</label>
                    <select id="profProvaAluno">
                        <option value="">Selecione o aluno...</option>
                    </select>
                </div>
                <div class="fld">
                    <label>Prazo de entrega (opcional)</label>
                    <input type="datetime-local" id="profProvaPrazo">
                </div>
                <div class="fld">
                    <label>Orientações (opcional)</label>
                    <textarea id="profProvaDesc" rows="2" placeholder="Instruções para o aluno, conteúdo da prova, critérios..."></textarea>
                </div>
                <div class="fld">
                    <label>Arquivo da prova/teste (opcional, PDF)</label>
                    <input type="file" id="profProvaArquivo" accept=".pdf,.doc,.docx">
                </div>
                <button type="submit" class="btn btn-p" style="width:auto;flex:none;" id="btnProfCriarProva">
                    <i class="fas fa-paper-plane"></i> Enviar Prova/Teste
                </button>
            </form>
        </div>

        <div id="profProvasLista">
            <div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando provas...</p></div>
        </div>
    </div>
    `

    setTimeout(() => {
        carregarAlunosProfessor()
        carregarTurmasParaDestino()
    }, 100)

    return h
}

function switchProfTab(tabId, btn) {
    $$('.tab-c').forEach(t => t.classList.remove('on'))
    $$('.tab-b').forEach(b => { b.classList.remove('on') })
    const tab = document.getElementById(`profTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`)
    if (tab) tab.classList.add('on')
    if (btn) btn.classList.add('on')

    if (tabId === 'turmas') carregarTurmasProfessor()
    if (tabId === 'provas') carregarProvasProfessor()
}

async function profSalvarVideoaula(e) {
    e.preventDefault()
    const titulo = sanitizar($('#profVaTitulo')?.value?.trim() || '')
    const nrId = parseInt($('#profVaNr')?.value || '0')
    const link = $('#profVaLink')?.value?.trim() || ''
    const descricao = sanitizar($('#profVaDesc')?.value?.trim() || '')
    const destino = $('#profVaDisponibilidade')?.value || 'global'
    const turmasDestino = destino === 'especifico' ? turmasSelecionadas('profVaTurmas') : []
    const btn = $('#btnProfSalvarVa')

    if (!titulo || !nrId || !link) {
        toast('Preencha todos os campos obrigatórios', 'warn')
        return
    }

    if (destino === 'especifico' && turmasDestino.length === 0) {
        toast('Selecione pelo menos uma turma para o conteúdo específico', 'warn')
        return
    }

    let embedLink = link
    if (link.includes('watch?v=')) {
        embedLink = link.replace('watch?v=', 'embed/')
    } else if (link.includes('youtu.be/')) {
        const videoId = link.split('youtu.be/')[1]?.split('?')[0]
        embedLink = `https://www.youtube.com/embed/${videoId}`
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publicando...' }

    try {
        const dadosVideoaula = {
            titulo: titulo,
            nr_id: nrId,
            url_video: embedLink,
            descricao: descricao,
            ordem: 0
        }
        if (destino === 'especifico') dadosVideoaula.publico = false

        const { data: videoaula, error } = await sbCriarVideoaula(dadosVideoaula)

        if (error) throw error

        if (destino === 'especifico' && videoaula?.id) {
            await vincularConteudoEmTurmas(turmasDestino, 'videoaula', videoaula.id)
        }

        toast(`Videoaula "${titulo}" publicada com sucesso!`, 'success')
        e.target.reset()
        if ($('#profVaTurmasWrap')) $('#profVaTurmasWrap').style.display = 'none'
    } catch (err) {
        console.error('Erro ao publicar videoaula:', err)
        toast('Erro ao publicar: ' + (err.message || 'Verifique o console'), 'err')
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Publicar Videoaula' }
    }
}

async function profUploadMaterial(e) {
    e.preventDefault()
    const titulo = sanitizar($('#profMatTitulo')?.value?.trim() || '')
    const nrId = parseInt($('#profMatNr')?.value || '0')
    const fileInput = $('#profMatFile')
    const descricao = sanitizar($('#profMatDesc')?.value?.trim() || '')
    const destino = $('#profMatDisponibilidade')?.value || 'global'
    const turmasDestino = destino === 'especifico' ? turmasSelecionadas('profMatTurmas') : []
    const btn = $('#btnProfUploadMat')
    const professorId = uid()

    if (!titulo || !nrId) {
        toast('Preencha o título e selecione a NR', 'warn')
        return
    }

    if (destino === 'especifico' && turmasDestino.length === 0) {
        toast('Selecione pelo menos uma turma para o material específico', 'warn')
        return
    }

    const file = fileInput?.files?.[0]
    if (!file) {
        toast('Selecione um arquivo para upload', 'warn')
        return
    }

    const maxSize = 20 * 1024 * 1024 // 20MB
    if (file.size > maxSize) {
        toast('Arquivo muito grande. Máximo: 20MB', 'warn')
        return
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...' }

    const progressDiv = $('#profUploadProgress')
    const progressBar = $('#profUploadBar')
    const progressTxt = $('#profUploadTxt')
    if (progressDiv) progressDiv.style.display = 'block'

    try {
        // Simulação de progresso durante upload
        let progresso = 0
        const timer = setInterval(() => {
            progresso = Math.min(progresso + 10, 85)
            if (progressBar) progressBar.style.width = progresso + '%'
        }, 300)

        const ext = file.name.split('.').pop()
        const timestamp = Date.now()
        const fileName = `materiais/nr${nrId}_${timestamp}.${ext}`

        const { data: uploadData, error: uploadError } = await sbUploadArquivo(STORAGE_BUCKET, fileName, file)

        clearInterval(timer)
        if (progressBar) progressBar.style.width = '95%'

        if (uploadError) throw uploadError

        const arquivoUrl = uploadData?.publicUrl || ''
        if (progressTxt) progressTxt.textContent = 'Registrando material...'

        const dadosMaterial = {
            titulo: titulo,
            nr_id: nrId,
            url: arquivoUrl,
            tipo: ext.toUpperCase(),
            descricao: descricao,
            criado_por: professorId
        }
        if (destino === 'especifico') dadosMaterial.publico = false

        const { data: material, error: matError } = await sbCriarMaterial(dadosMaterial)

        if (matError) throw matError

        if (destino === 'especifico' && material?.id) {
            await vincularConteudoEmTurmas(turmasDestino, 'material', material.id)
        }

        if (progressBar) progressBar.style.width = '100%'
        if (progressTxt) progressTxt.textContent = 'Concluído!'

        setTimeout(() => {
            if (progressDiv) progressDiv.style.display = 'none'
            if (progressBar) progressBar.style.width = '0%'
        }, 2000)

        toast(`Material "${titulo}" enviado com sucesso!`, 'success')
        e.target.reset()
        if ($('#profMatTurmasWrap')) $('#profMatTurmasWrap').style.display = 'none'
    } catch (err) {
        console.error('Erro no upload:', err)
        toast('Erro no upload: ' + (err.message || 'Verifique o console e as permissões do Storage'), 'err')
        if (progressDiv) progressDiv.style.display = 'none'
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Enviar Material' }
    }
}

async function profCriarSala(e) {
    e.preventDefault()
    const topico = sanitizar($('#profSalaTopico')?.value?.trim() || '')
    const meetLink = $('#profSalaMeet')?.value?.trim() || ''
    const btn = $('#btnProfCriarSala')
    const professorId = uid()

    if (!topico || !meetLink) {
        toast('Preencha o tópico e o link do Meet', 'warn')
        return
    }

    if (!meetLink.includes('meet.google.com') && !meetLink.includes('meet.')) {
        toast('Informe um link válido do Google Meet', 'warn')
        return
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando...' }

    try {
        const meetId = meetLink.split('/').pop()?.split('?')[0] || meetLink
        const { error } = await sbCriarSala(topico, meetId, professorId)

        if (error) throw error

        toast(`Sala "${topico}" criada! Alunos podem entrar agora.`, 'success')
        e.target.reset()
    } catch (err) {
        console.error('Erro ao criar sala:', err)
        toast('Erro ao criar sala: ' + (err.message || 'Erro inesperado'), 'err')
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-broadcast-tower"></i> Abrir Sala ao Vivo' }
    }
}

// ============================================================
// HELPERS DE TURMAS / CONTEÚDOS
// ============================================================

function rotuloAluno(aluno) {
    const nome = aluno?.nome_completo || 'Aluno'
    const email = aluno?.email || ''
    return email ? `${nome} — ${email}` : nome
}

function nomeAluno(id) {
    const aluno = alunosProfCache.find(a => String(a.id) === String(id))
    return aluno?.nome_completo || 'Aluno'
}

function nomeTurma(id) {
    const turma = turmasProfCache.find(t => String(t.id) === String(id))
    return turma?.nome || 'Turma'
}

function turmasSelecionadas(containerId) {
    return Array.from(document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`))
        .map(input => input.value)
}

function nomeConteudo(vinculo) {
    if (vinculo.material_id) {
        const material = conteudosDisponiveisCache.materiais.find(m => String(m.id) === String(vinculo.material_id))
        return material?.titulo || 'Material'
    }
    const videoaula = conteudosDisponiveisCache.videoaulas.find(v => String(v.id) === String(vinculo.videoaula_id))
    return videoaula?.titulo || 'Videoaula'
}

function mensagemErroModulo(error, fallback = 'Erro ao carregar o módulo.') {
    const msg = String(error?.message || '')
    if (
        msg.toLowerCase().includes('does not exist') ||
        msg.toLowerCase().includes('schema cache') ||
        msg.toLowerCase().includes('relation')
    ) {
        return 'Módulo ainda não instalado no banco. Execute a migration de direcionamento no Supabase.'
    }
    return msg || fallback
}

async function carregarAlunosProfessor() {
    const { data, error } = await sbGetAlunos()
    if (error) {
        console.warn('Erro ao carregar alunos:', error)
        return
    }
    alunosProfCache = data || []
    preencherDatalistAlunos()
    preencherSelectAlunosProva()
}

function preencherDatalistAlunos() {
    const datalist = $('#profAlunosDatalist')
    if (!datalist) return
    datalist.innerHTML = alunosProfCache
        .map(aluno => `<option value="${sanitizar(rotuloAluno(aluno))}"></option>`)
        .join('')
}

function preencherSelectAlunosProva() {
    const select = $('#profProvaAluno')
    if (!select) return
    const atual = select.value
    select.innerHTML = `<option value="">Selecione o aluno...</option>` + alunosProfCache
        .map(aluno => `<option value="${sanitizar(String(aluno.id))}">${sanitizar(rotuloAluno(aluno))}</option>`)
        .join('')
    if (atual) select.value = atual
}

function preencherSelectTurmasProva() {
    const select = $('#profProvaTurma')
    if (!select) return
    const atual = select.value
    select.innerHTML = `<option value="">Selecione a turma...</option>` + turmasProfCache
        .map(turma => `<option value="${sanitizar(String(turma.id))}">${sanitizar(turma.nome)}</option>`)
        .join('')
    if (atual) select.value = atual
}

function renderTurmasDestino(containerId) {
    const container = document.getElementById(containerId)
    if (!container) return

    if (turmasProfCache.length === 0) {
        container.innerHTML = `<p style="font-size:12px;color:var(--tx3);margin:4px">Nenhuma turma criada. Crie uma turma na aba Turmas/Trilhas.</p>`
        return
    }

    container.innerHTML = turmasProfCache.map(turma => `
        <label style="display:flex;align-items:center;gap:8px;padding:7px 4px;font-size:13px;color:var(--tx);cursor:pointer">
            <input type="checkbox" value="${sanitizar(String(turma.id))}" style="width:auto">
            <span style="flex:1">${sanitizar(turma.nome)}</span>
            <span class="badge" style="background:var(--bd);color:var(--tx3)">${TIPO_TURMA[turma.tipo]?.label || turma.tipo}</span>
        </label>
    `).join('')
}

async function carregarTurmasParaDestino() {
    const { data, error } = await sbGetTurmas()

    if (error) {
        const msg = mensagemErroModulo(error)
        for (const id of ['profVaTurmas', 'profMatTurmas']) {
            const container = document.getElementById(id)
            if (container) container.innerHTML = `<p style="font-size:12px;color:var(--tx3);margin:4px">${sanitizar(msg)}</p>`
        }
        return
    }

    turmasProfCache = data || []
    renderTurmasDestino('profVaTurmas')
    renderTurmasDestino('profMatTurmas')
    preencherSelectTurmasProva()
}

function profToggleDestinoVa() {
    const especifico = $('#profVaDisponibilidade')?.value === 'especifico'
    const wrap = $('#profVaTurmasWrap')
    if (wrap) wrap.style.display = especifico ? 'block' : 'none'
}

function profToggleDestinoMat() {
    const especifico = $('#profMatDisponibilidade')?.value === 'especifico'
    const wrap = $('#profMatTurmasWrap')
    if (wrap) wrap.style.display = especifico ? 'block' : 'none'
}

function profToggleAlvoProva() {
    const aluno = $('#profProvaDestinoTipo')?.value === 'aluno'
    const wrapTurma = $('#profProvaTurmaWrap')
    const wrapAluno = $('#profProvaAlunoWrap')
    if (wrapTurma) wrapTurma.style.display = aluno ? 'none' : 'block'
    if (wrapAluno) wrapAluno.style.display = aluno ? 'block' : 'none'
}

async function vincularConteudoEmTurmas(turmas, tipo, conteudoId) {
    let falhas = 0

    for (const turmaId of turmas) {
        const { error } = await sbVincularConteudoTurma(turmaId, tipo, conteudoId, uid())
        if (error && error.code !== '23505') {
            falhas++
            console.error('Erro ao vincular conteúdo à turma:', error)
        }
    }

    if (falhas > 0) {
        toast(`${falhas} turma(s) não receberam o conteúdo. Verifique as permissões.`, 'warn')
    }
}

// ============================================================
// TURMAS / TRILHAS
// ============================================================

async function carregarTurmasProfessor() {
    const lista = $('#profTurmasLista')
    if (!lista) return
    lista.innerHTML = `<div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando turmas...</p></div>`

    const [turmas, alunos, vinculosAlunos, vinculosConteudos, materiais, videoaulas] = await Promise.all([
        sbGetTurmas(),
        sbGetAlunos(),
        sbGetTurmaAlunos(),
        sbGetTurmaMateriais(),
        sbGetMateriais(null, null),
        sbGetVideoaulas(null, null)
    ])

    if (turmas.error) {
        console.error('Erro ao carregar turmas:', turmas.error)
        lista.innerHTML = `
            <div class="empty">
                <i class="fas fa-triangle-exclamation"></i>
                <h4>Não foi possível carregar as turmas</h4>
                <p>${sanitizar(mensagemErroModulo(turmas.error))}</p>
            </div>
        `
        return
    }

    turmasProfCache = turmas.data || []
    if (!alunos.error) alunosProfCache = alunos.data || alunosProfCache
    turmaAlunosProfCache = vinculosAlunos.error ? [] : (vinculosAlunos.data || [])
    turmaMateriaisProfCache = vinculosConteudos.error ? [] : (vinculosConteudos.data || [])
    conteudosDisponiveisCache = {
        materiais: materiais.error ? [] : (materiais.data || []),
        videoaulas: videoaulas.error ? [] : (videoaulas.data || [])
    }

    preencherDatalistAlunos()
    preencherSelectTurmasProva()
    preencherSelectAlunosProva()
    renderTurmasProfessor()
}

function renderTurmasProfessor() {
    const lista = $('#profTurmasLista')
    if (!lista) return

    if (turmasProfCache.length === 0) {
        lista.innerHTML = `
            <div class="empty">
                <i class="fas fa-users"></i>
                <h4>Nenhuma turma/trilha criada</h4>
                <p>Crie a primeira turma acima e depois adicione alunos e conteúdos.</p>
            </div>
        `
        return
    }

    lista.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">${turmasProfCache.map(turma => {
        const tipo = TIPO_TURMA[turma.tipo] || TIPO_TURMA.turma
        const alunos = turmaAlunosProfCache.filter(v => String(v.turma_id) === String(turma.id))
        const conteudos = turmaMateriaisProfCache.filter(v => String(v.turma_id) === String(turma.id))

        const chipsAlunos = alunos.length
            ? alunos.map(v => `
                <span class="badge" style="background:var(--ip);color:var(--tx2);display:inline-flex;align-items:center;gap:6px;margin:2px">
                    ${sanitizar(nomeAluno(v.aluno_id))}
                    <button data-turma="${sanitizar(String(turma.id))}" data-aluno="${sanitizar(String(v.aluno_id))}" onclick="window.profRemoverAlunoTurma(this.dataset.turma, this.dataset.aluno)" style="background:none;border:none;color:#D32F2F;cursor:pointer;padding:0;font-size:12px" title="Remover aluno">&times;</button>
                </span>
            `).join('')
            : `<span style="font-size:12px;color:var(--tx3)">Nenhum aluno inscrito.</span>`

        const chipsConteudos = conteudos.length
            ? conteudos.map(v => {
                const ehMaterial = Boolean(v.material_id)
                return `
                    <span class="badge" style="background:var(--ip);color:var(--tx2);display:inline-flex;align-items:center;gap:6px;margin:2px">
                        <i class="fas ${ehMaterial ? 'fa-file-pdf' : 'fa-circle-play'}"></i>
                        ${sanitizar(nomeConteudo(v))}
                        <button data-turma="${sanitizar(String(turma.id))}" data-tipo="${ehMaterial ? 'material' : 'videoaula'}" data-id="${sanitizar(String(ehMaterial ? v.material_id : v.videoaula_id))}" onclick="window.profRemoverConteudoTurma(this.dataset.turma, this.dataset.tipo, this.dataset.id)" style="background:none;border:none;color:#D32F2F;cursor:pointer;padding:0;font-size:12px" title="Desvincular conteúdo">&times;</button>
                    </span>
                `
            }).join('')
            : `<span style="font-size:12px;color:var(--tx3)">Nenhum conteúdo vinculado.</span>`

        return `
            <div class="pnl" style="margin:0;display:flex;flex-direction:column;gap:12px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                    <div>
                        <span class="badge bg-info"><i class="fas ${tipo.icon}"></i> ${tipo.label}</span>
                        <h3 style="font-size:16px;font-weight:800;margin:8px 0 4px">${sanitizar(turma.nome)}</h3>
                        ${turma.descricao ? `<p style="font-size:12px;color:var(--tx3)">${sanitizar(turma.descricao)}</p>` : ''}
                    </div>
                    <button class="btn btn-sm" style="background:#ef4444;color:#fff;flex:none" data-id="${sanitizar(String(turma.id))}" onclick="window.profExcluirTurma(this.dataset.id)" title="Excluir turma">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div>
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--tx3);margin-bottom:6px"><i class="fas fa-user-graduate"></i> Alunos (${alunos.length})</div>
                    <div style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:8px">${chipsAlunos}</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                        <input type="text" id="profAlunoInput_${sanitizar(String(turma.id))}" list="profAlunosDatalist" placeholder="Buscar aluno por nome ou e-mail" style="flex:1;min-width:150px;padding:8px;font-size:12px;border:1px solid var(--bd);border-radius:8px;background:var(--ip);color:var(--tx)">
                        <button class="btn btn-sm btn-s" data-turma="${sanitizar(String(turma.id))}" onclick="window.profAdicionarAlunoTurma(this.dataset.turma)" style="flex:none">
                            <i class="fas fa-user-plus"></i> Adicionar
                        </button>
                    </div>
                </div>
                <div>
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--tx3);margin-bottom:6px"><i class="fas fa-folder-open"></i> Conteúdos (${conteudos.length})</div>
                    <div style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:8px">${chipsConteudos}</div>
                    <button class="btn btn-sm btn-p" data-turma="${sanitizar(String(turma.id))}" onclick="window.abrirMateriaisTurma(this.dataset.turma)" style="width:auto;flex:none">
                        <i class="fas fa-plus"></i> Adicionar Material
                    </button>
                </div>
            </div>
        `
    }).join('')}</div>`
}

async function profCriarTurma(e) {
    e.preventDefault()
    const nome = $('#profTurmaNome')?.value?.trim() || ''
    const tipo = $('#profTurmaTipo')?.value || 'turma'
    const descricao = $('#profTurmaDesc')?.value?.trim() || ''
    const btn = $('#btnProfCriarTurma')

    if (nome.length < 3) {
        toast('Informe um nome com pelo menos 3 caracteres', 'warn')
        return
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando...' }

    try {
        const { error } = await sbCriarTurma({
            nome,
            descricao,
            tipo,
            criado_por: uid()
        })

        if (error) throw error

        toast(`Turma "${nome}" criada com sucesso!`, 'success')
        e.target.reset()
        await carregarTurmasProfessor()
        await carregarTurmasParaDestino()
    } catch (err) {
        console.error('Erro ao criar turma:', err)
        toast('Erro ao criar turma: ' + mensagemErroModulo(err, 'Verifique as permissões.'), 'err')
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Criar Turma' }
    }
}

async function profExcluirTurma(id) {
    if (!confirm('Excluir esta turma? Os vínculos de alunos e conteúdos também serão removidos.')) return

    const { error } = await sbExcluirTurma(id)
    if (error) {
        console.error('Erro ao excluir turma:', error)
        toast('Erro ao excluir turma: ' + (error.message || 'Verifique as permissões.'), 'err')
        return
    }

    toast('Turma excluída.', 'success')
    await carregarTurmasProfessor()
    await carregarTurmasParaDestino()
}

async function profAdicionarAlunoTurma(turmaId) {
    const input = document.getElementById(`profAlunoInput_${turmaId}`)
    const valor = input?.value?.trim() || ''

    if (!valor) {
        toast('Selecione um aluno.', 'warn')
        return
    }

    const aluno = alunosProfCache.find(a =>
        rotuloAluno(a) === valor ||
        String(a.id) === valor ||
        String(a.email || '').toLowerCase() === valor.toLowerCase()
    )

    if (!aluno) {
        toast('Aluno não encontrado. Selecione uma opção da lista.', 'warn')
        return
    }

    const { error } = await sbAdicionarAlunoTurma(turmaId, aluno.id)
    if (error && error.code !== '23505') {
        console.error('Erro ao adicionar aluno:', error)
        toast('Erro ao adicionar aluno: ' + (error.message || 'Verifique as permissões.'), 'err')
        return
    }

    toast(`${nomeAluno(aluno.id)} adicionado à turma.`, 'success')
    if (input) input.value = ''
    await carregarTurmasProfessor()
}

async function profRemoverAlunoTurma(turmaId, alunoId) {
    if (!confirm(`Remover ${nomeAluno(alunoId)} desta turma?`)) return

    const { error } = await sbRemoverAlunoTurma(turmaId, alunoId)
    if (error) {
        console.error('Erro ao remover aluno:', error)
        toast('Erro ao remover aluno: ' + (error.message || 'Verifique as permissões.'), 'err')
        return
    }

    toast('Aluno removido da turma.', 'success')
    await carregarTurmasProfessor()
}

async function profRemoverConteudoTurma(turmaId, tipo, conteudoId) {
    if (!confirm('Desvincular este conteúdo da turma?')) return

    const { error } = await sbDesvincularConteudoTurma(turmaId, tipo, conteudoId)
    if (error) {
        console.error('Erro ao desvincular conteúdo:', error)
        toast('Erro ao desvincular conteúdo: ' + (error.message || 'Verifique as permissões.'), 'err')
        return
    }

    toast('Conteúdo desvinculado da turma.', 'success')
    await carregarTurmasProfessor()
}

async function carregarConteudosDisponiveis(forcar = false) {
    if (!forcar && (conteudosDisponiveisCache.materiais.length || conteudosDisponiveisCache.videoaulas.length)) {
        return true
    }

    const [materiais, videoaulas] = await Promise.all([
        sbGetMateriais(null, null),
        sbGetVideoaulas(null, null)
    ])

    if (materiais.error) {
        console.error('Erro ao carregar materiais:', materiais.error)
        toast('Erro ao carregar materiais: ' + mensagemErroModulo(materiais.error), 'err')
    }
    if (videoaulas.error) {
        console.error('Erro ao carregar videoaulas:', videoaulas.error)
        toast('Erro ao carregar videoaulas: ' + mensagemErroModulo(videoaulas.error), 'err')
    }

    conteudosDisponiveisCache = {
        materiais: materiais.data || [],
        videoaulas: videoaulas.data || []
    }
    return !materiais.error && !videoaulas.error
}

async function abrirMateriaisTurma(turmaId) {
    const turma = turmasProfCache.find(t => String(t.id) === String(turmaId))
    if (!turma) {
        toast('Turma não encontrada.', 'err')
        return
    }

    const ok = await carregarConteudosDisponiveis()
    if (!ok) return

    const vinculados = new Set(
        turmaMateriaisProfCache
            .filter(v => String(v.turma_id) === String(turmaId))
            .map(v => v.material_id ? `material:${v.material_id}` : `videoaula:${v.videoaula_id}`)
    )

    const renderGrupo = (titulo, icone, tipo, itens) => {
        if (!itens.length) return ''
        return `
            <div style="margin-bottom:14px">
                <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--tx3);margin:8px 0 6px"><i class="fas ${icone}"></i> ${titulo} (${itens.length})</div>
                ${itens.map(item => {
                    const chave = `${tipo}:${item.id}`
                    const tituloItem = item.titulo || (tipo === 'material' ? 'Material' : 'Videoaula')
                    const nr = item.nr_id || item.nr || ''
                    return `
                        <label data-item-conteudo data-search="${sanitizar(`${tituloItem} nr ${nr}`.toLowerCase())}" style="display:flex;align-items:center;gap:8px;padding:7px;border-bottom:1px solid var(--bd);font-size:12px;cursor:pointer">
                            <input type="checkbox" data-tipo="${tipo}" data-id="${sanitizar(String(item.id))}" ${vinculados.has(chave) ? 'checked' : ''} style="width:auto">
                            <span style="flex:1">${sanitizar(tituloItem)}${nr ? ` <span style="color:var(--tx3)">(NR ${sanitizar(String(nr))})</span>` : ''}</span>
                        </label>
                    `
                }).join('')}
            </div>
        `
    }

    openMdl(`
        <button class="mdl-x" onclick="window.closeMdl()"><i class="fas fa-times"></i></button>
        <h2 style="font-size:18px;font-weight:800;color:var(--p);margin-bottom:4px"><i class="fas fa-folder-plus"></i> Conteúdos da turma</h2>
        <p style="font-size:12px;color:var(--tx3);margin-bottom:12px">${sanitizar(turma.nome)}</p>
        <div class="fld">
            <input type="text" id="profBuscaConteudoTurma" placeholder="Buscar videoaula ou material..." oninput="window.filtrarConteudosTurma()">
        </div>
        <div id="profListaConteudosTurma" style="max-height:46vh;overflow:auto;border:1px solid var(--bd);border-radius:10px;padding:8px 10px">
            ${renderGrupo('Videoaulas', 'fa-circle-play', 'videoaula', conteudosDisponiveisCache.videoaulas)}
            ${renderGrupo('Materiais / PDFs', 'fa-file-pdf', 'material', conteudosDisponiveisCache.materiais)}
            ${!conteudosDisponiveisCache.videoaulas.length && !conteudosDisponiveisCache.materiais.length ? '<div class="empty"><p>Nenhum conteúdo cadastrado ainda.</p></div>' : ''}
        </div>
        <button class="btn btn-p btn-block" style="margin-top:16px" data-turma="${sanitizar(String(turma.id))}" onclick="window.salvarConteudosTurma(this.dataset.turma)">
            <i class="fas fa-save"></i> Salvar vínculos
        </button>
    `)
}

function filtrarConteudosTurma() {
    const termo = ($('#profBuscaConteudoTurma')?.value || '').toLowerCase().trim()
    $$('#profListaConteudosTurma [data-item-conteudo]').forEach(item => {
        item.style.display = !termo || (item.dataset.search || '').includes(termo) ? 'flex' : 'none'
    })
}

async function salvarConteudosTurma(turmaId) {
    const selecionados = Array.from(document.querySelectorAll('#profListaConteudosTurma input[type="checkbox"]:checked'))
        .map(input => ({ tipo: input.dataset.tipo, id: input.dataset.id }))

    const atuais = turmaMateriaisProfCache.filter(v => String(v.turma_id) === String(turmaId))
    const atuaisChaves = new Set(atuais.map(v => v.material_id ? `material:${v.material_id}` : `videoaula:${v.videoaula_id}`))
    const selecionadosChaves = new Set(selecionados.map(item => `${item.tipo}:${item.id}`))

    let falhas = 0

    for (const vinculo of atuais) {
        const tipo = vinculo.material_id ? 'material' : 'videoaula'
        const conteudoId = vinculo.material_id || vinculo.videoaula_id
        if (!selecionadosChaves.has(`${tipo}:${conteudoId}`)) {
            const { error } = await sbDesvincularConteudoTurma(turmaId, tipo, conteudoId)
            if (error) { falhas++; console.error('Erro ao desvincular:', error) }
        }
    }

    for (const item of selecionados) {
        if (!atuaisChaves.has(`${item.tipo}:${item.id}`)) {
            const { error } = await sbVincularConteudoTurma(turmaId, item.tipo, item.id, uid())
            if (error && error.code !== '23505') { falhas++; console.error('Erro ao vincular:', error) }
        }
    }

    if (falhas > 0) {
        toast(`${falhas} alteração(ões) não puderam ser salvas.`, 'warn')
    } else {
        toast('Conteúdos da turma atualizados!', 'success')
    }

    closeMdl()
    await carregarTurmasProfessor()
}

// ============================================================
// PROVAS / TESTES DIRECIONADOS
// ============================================================

async function carregarProvasProfessor() {
    const lista = $('#profProvasLista')
    if (!lista) return
    lista.innerHTML = `<div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando provas...</p></div>`

    const [turmas, alunos, provas] = await Promise.all([
        sbGetTurmas(),
        sbGetAlunos(),
        sbGetProvasDirecionadasProfessor()
    ])

    if (!turmas.error) {
        turmasProfCache = turmas.data || turmasProfCache
        preencherSelectTurmasProva()
    }
    if (!alunos.error) {
        alunosProfCache = alunos.data || alunosProfCache
        preencherSelectAlunosProva()
    }

    if (provas.error) {
        console.error('Erro ao carregar provas:', provas.error)
        lista.innerHTML = `
            <div class="empty">
                <i class="fas fa-triangle-exclamation"></i>
                <h4>Não foi possível carregar as provas</h4>
                <p>${sanitizar(mensagemErroModulo(provas.error))}</p>
            </div>
        `
        return
    }

    provasProfCache = provas.data || []
    renderProvasProfessor()
}

function renderProvasProfessor() {
    const lista = $('#profProvasLista')
    if (!lista) return

    if (provasProfCache.length === 0) {
        lista.innerHTML = `
            <div class="empty">
                <i class="fas fa-file-signature"></i>
                <h4>Nenhuma prova/teste direcionado</h4>
                <p>Crie uma prova acima e envie para uma turma ou para um aluno específico.</p>
            </div>
        `
        return
    }

    lista.innerHTML = `<div class="tw"><table>
        <thead><tr><th>Título</th><th>NR</th><th>Tipo</th><th>Destino</th><th>Prazo</th><th>Arquivo</th><th>Ações</th></tr></thead>
        <tbody>
            ${provasProfCache.map(prova => {
                const destino = prova.turma_id
                    ? `<i class="fas fa-users"></i> ${sanitizar(nomeTurma(prova.turma_id))}`
                    : `<i class="fas fa-user"></i> ${sanitizar(nomeAluno(prova.aluno_id))}`
                const prazo = prova.prazo
                    ? new Date(prova.prazo).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                    : '—'
                return `<tr>
                    <td><strong>${sanitizar(prova.titulo)}</strong>${prova.descricao ? `<br><span style="font-size:11px;color:var(--tx3)">${sanitizar(prova.descricao)}</span>` : ''}</td>
                    <td>${prova.nr_id ? `NR ${sanitizar(String(prova.nr_id))}` : '—'}</td>
                    <td><span class="badge bg-info">${prova.tipo === 'teste' ? 'Teste' : 'Prova'}</span></td>
                    <td>${destino}</td>
                    <td>${sanitizar(prazo)}</td>
                    <td>${prova.arquivo_url ? `<a href="${sanitizar(prova.arquivo_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-s"><i class="fas fa-file-pdf"></i> Abrir</a>` : '—'}</td>
                    <td><button class="btn btn-sm" style="background:#ef4444;color:#fff" data-id="${sanitizar(String(prova.id))}" onclick="window.profExcluirProvaDirecionada(this.dataset.id)"><i class="fas fa-trash"></i></button></td>
                </tr>`
            }).join('')}
        </tbody>
    </table></div>`
}

async function profCriarProvaDirecionada(e) {
    e.preventDefault()
    const titulo = $('#profProvaTitulo')?.value?.trim() || ''
    const nrId = parseInt($('#profProvaNR')?.value || '0') || null
    const tipo = $('#profProvaTipo')?.value || 'prova'
    const destinoTipo = $('#profProvaDestinoTipo')?.value || 'turma'
    const turmaId = destinoTipo === 'turma' ? ($('#profProvaTurma')?.value || null) : null
    const alunoId = destinoTipo === 'aluno' ? ($('#profProvaAluno')?.value || null) : null
    const prazoValor = $('#profProvaPrazo')?.value || ''
    const descricao = $('#profProvaDesc')?.value?.trim() || ''
    const arquivo = $('#profProvaArquivo')?.files?.[0]
    const btn = $('#btnProfCriarProva')

    if (!titulo) {
        toast('Informe o título da prova/teste', 'warn')
        return
    }

    if (destinoTipo === 'turma' && !turmaId) {
        toast('Selecione a turma de destino', 'warn')
        return
    }

    if (destinoTipo === 'aluno' && !alunoId) {
        toast('Selecione o aluno de destino', 'warn')
        return
    }

    if (arquivo && arquivo.size > 15 * 1024 * 1024) {
        toast('Arquivo muito grande. Máximo: 15MB', 'warn')
        return
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...' }

    try {
        let arquivoUrl = null

        if (arquivo) {
            const nomeArquivo = arquivo.name.replace(/\s+/g, '_')
            const path = `provas-diretas/${uid()}/${Date.now()}_${nomeArquivo}`
            const { data: uploadData, error: uploadError } = await sbUploadArquivo(STORAGE_BUCKET, path, arquivo)
            if (uploadError) throw uploadError
            arquivoUrl = uploadData?.publicUrl || null
        }

        const { data: prova, error } = await sbCriarProvaDirecionada({
            titulo,
            descricao,
            nr_id: nrId,
            tipo,
            turma_id: turmaId,
            aluno_id: alunoId,
            arquivo_url: arquivoUrl,
            prazo: prazoValor ? new Date(prazoValor).toISOString() : null,
            publicado: true,
            criado_por: uid()
        })

        if (error) throw error

        await notificarAlunosProva(prova)
        toast(`Prova/teste "${titulo}" enviada com sucesso!`, 'success')
        e.target.reset()
        profToggleAlvoProva()
        await carregarProvasProfessor()
    } catch (err) {
        console.error('Erro ao criar prova direcionada:', err)
        toast('Erro ao enviar prova/teste: ' + mensagemErroModulo(err, 'Verifique as permissões.'), 'err')
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Prova/Teste' }
    }
}

async function notificarAlunosProva(prova) {
    if (!prova) return

    let alunosIds = []
    if (prova.turma_id) {
        const { data } = await sbGetTurmaAlunos(prova.turma_id)
        alunosIds = (data || []).map(v => v.aluno_id)
    } else if (prova.aluno_id) {
        alunosIds = [prova.aluno_id]
    }

    if (alunosIds.length === 0) return

    const mensagem = `${prova.tipo === 'teste' ? 'Novo teste' : 'Nova prova'}: "${prova.titulo}"${prova.prazo ? ` — prazo ${new Date(prova.prazo).toLocaleString('pt-BR')}` : ''}`

    await Promise.allSettled(alunosIds.map(alunoId =>
        sbCriarNotificacao(alunoId, 'Nova prova/teste', mensagem, 'provas')
    ))
}

async function profExcluirProvaDirecionada(id) {
    if (!confirm('Excluir esta prova/teste direcionado?')) return

    const { error } = await sbExcluirProvaDirecionada(id)
    if (error) {
        console.error('Erro ao excluir prova:', error)
        toast('Erro ao excluir prova: ' + (error.message || 'Verifique as permissões.'), 'err')
        return
    }

    toast('Prova/teste excluído.', 'success')
    await carregarProvasProfessor()
}

window.switchProfTab = switchProfTab
window.profSalvarVideoaula = profSalvarVideoaula
window.profUploadMaterial = profUploadMaterial
window.profCriarSala = profCriarSala
window.profToggleDestinoVa = profToggleDestinoVa
window.profToggleDestinoMat = profToggleDestinoMat
window.profToggleAlvoProva = profToggleAlvoProva
window.profCriarTurma = profCriarTurma
window.profExcluirTurma = profExcluirTurma
window.profAdicionarAlunoTurma = profAdicionarAlunoTurma
window.profRemoverAlunoTurma = profRemoverAlunoTurma
window.profRemoverConteudoTurma = profRemoverConteudoTurma
window.abrirMateriaisTurma = abrirMateriaisTurma
window.filtrarConteudosTurma = filtrarConteudosTurma
window.salvarConteudosTurma = salvarConteudosTurma
window.profCriarProvaDirecionada = profCriarProvaDirecionada
window.profExcluirProvaDirecionada = profExcluirProvaDirecionada
window.carregarTurmasProfessor = carregarTurmasProfessor
window.carregarProvasProfessor = carregarProvasProfessor
