// ============================================================
// VIEW: ÁREA DO PROFESSOR
// ============================================================
import { S, NRS, nav, uid, isAdmin, isProf } from '../state.js'
import { sbCriarVideoaula, sbCriarMaterial, sbCriarSala, sbUploadArquivo, STORAGE_BUCKET } from '../supabase-client.js'
import { toast, sanitizar, openMdl, closeMdl, $, $$ } from '../utils.js'

export function vProfessor() {
    if (!isProf() && !isAdmin()) return window.nav('inicio')

    const optsNR = NRS.map(n => `<option value="${n.n}">NR ${n.n} — ${sanitizar(n.nome)}</option>`).join('')

    let h = `<div class="btn-back" onclick="window.nav('inicio')"><i class="fas fa-arrow-left"></i> Voltar</div>`
    h += `
    <div class="god-hd">
        <h2><i class="fas fa-chalkboard-user"></i> Área do Professor</h2>
        <p>Gerencie videoaulas, materiais e salas ao vivo — ${sanitizar(S.user?.nome_completo || '')}</p>
    </div>

    <div class="tabs" style="margin-bottom:24px">
        <button class="tab-b on" onclick="switchProfTab('videoaulas', this)"><i class="fas fa-circle-play"></i> Videoaulas</button>
        <button class="tab-b" onclick="switchProfTab('materiais', this)"><i class="fas fa-file-pdf"></i> Materiais</button>
        <button class="tab-b" onclick="switchProfTab('salas', this)"><i class="fas fa-tower-broadcast"></i> Salas ao Vivo</button>
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
    `

    return h
}

function switchProfTab(tabId, btn) {
    $$('.tab-c').forEach(t => t.classList.remove('on'))
    $$('.tab-b').forEach(b => { b.classList.remove('on') })
    const tab = document.getElementById(`profTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`)
    if (tab) tab.classList.add('on')
    if (btn) btn.classList.add('on')
}

async function profSalvarVideoaula(e) {
    e.preventDefault()
    const titulo = sanitizar($('#profVaTitulo')?.value?.trim() || '')
    const nrId = parseInt($('#profVaNr')?.value || '0')
    const link = $('#profVaLink')?.value?.trim() || ''
    const descricao = sanitizar($('#profVaDesc')?.value?.trim() || '')
    const btn = $('#btnProfSalvarVa')
    const professorId = uid()

    if (!titulo || !nrId || !link) {
        toast('Preencha todos os campos obrigatórios', 'warn')
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
        const { error } = await sbCriarVideoaula({
            titulo: titulo,
            nr: nrId,
            nr_id: nrId,
            link_youtube: embedLink,
            descricao: descricao,
            criado_por: professorId,
            ordem: 0
        })

        if (error) throw error

        toast(`Videoaula "${titulo}" publicada com sucesso!`, 'success')
        e.target.reset()
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
    const btn = $('#btnProfUploadMat')
    const professorId = uid()

    if (!titulo || !nrId) {
        toast('Preencha o título e selecione a NR', 'warn')
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

        const { error: matError } = await sbCriarMaterial({
            titulo: titulo,
            nr_id: nrId,
            arquivo_url: arquivoUrl,
            tipo: ext.toUpperCase(),
            descricao: descricao,
            criado_por: professorId
        })

        if (matError) throw matError

        if (progressBar) progressBar.style.width = '100%'
        if (progressTxt) progressTxt.textContent = 'Concluído!'

        setTimeout(() => {
            if (progressDiv) progressDiv.style.display = 'none'
            if (progressBar) progressBar.style.width = '0%'
        }, 2000)

        toast(`Material "${titulo}" enviado com sucesso!`, 'success')
        e.target.reset()
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

window.switchProfTab = switchProfTab
window.profSalvarVideoaula = profSalvarVideoaula
window.profUploadMaterial = profUploadMaterial
window.profCriarSala = profCriarSala
