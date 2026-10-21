// ============================================================
// VIEW: MATERIAIS (com upload, edição e exclusão)
// ============================================================

import { S, nav, NRS } from './state.js'
import { isAdmin, isProf, uid, toast, handleError, sanitizar, $, $$ } from './utils.js'

import {
    sb,
    sbGetMateriais,
    sbCriarMaterial,
    sbUploadArquivo,
    STORAGE_BUCKET,
    sbGetAlunos,
    sbCriarNotificacao
} from './supabase-client.js'

export function vMateriais() {
    let h = `<div class="btn-back" onclick="nav('inicio')"><i class="fas fa-arrow-left"></i> Voltar</div>`
    h += `<h2 class="wc">Materiais de Apoio</h2><p class="wcs">Arquivos, apostilas e recursos complementares por NR.</p>`

    if (isAdmin() || isProf()) {
        h += `<div class="pnl" style="margin-bottom:24px;border:2px dashed var(--p);">
            <div class="pnl-h"><div class="pnl-t"><i class="fas fa-upload"></i> Subir novo material</div></div>
            <form id="frmAddMaterial" enctype="multipart/form-data" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="fld" style="grid-column:span 2;">
                    <label>NR</label>
                    <select id="addMatNR" required>
                        ${NRS.map(n => `<option value="${n.n}">NR ${n.n} — ${n.nome}</option>`).join('')}
                    </select>
                </div>
                <div class="fld">
                    <label>Título do material</label>
                    <input type="text" id="addMatTitulo" placeholder="Ex: Apostila NR 10" required>
                </div>
                <div class="fld">
                    <label>Tipo</label>
                    <select id="addMatTipo">
                        <option value="arquivo">Arquivo (PDF, DOC, etc.)</option>
                        <option value="link">Link externo</option>
                    </select>
                </div>
                <div class="fld" style="grid-column:span 2;">
                    <label>Arquivo (PDF, DOC, Imagem, etc.)</label>
                    <input type="file" id="addMatArquivo" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.ppt,.pptx,.xls,.xlsx,.txt">
                    <p style="font-size:11px;color:var(--tx3);margin-top:4px;">Máximo 20MB</p>
                </div>
                <div class="fld" style="grid-column:span 2;">
                    <label>Link externo (opcional se já enviou arquivo)</label>
                    <input type="url" id="addMatUrl" placeholder="https://drive.google.com/...">
                </div>
                <div class="fld" style="grid-column:span 2;">
                    <label>Descrição (opcional)</label>
                    <textarea id="addMatDesc" rows="2" placeholder="Descreva o material..."></textarea>
                </div>
                <button type="submit" class="btn btn-p" style="grid-column:span 2;">
                    <i class="fas fa-cloud-upload-alt"></i> Adicionar Material
                </button>
            </form>
        </div>`
    }

    h += `<div id="materiaisGrid"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando materiais...</p></div></div>`

    setTimeout(() => {
        const form = $('#frmAddMaterial')

        if (form) {
            form.addEventListener('submit', async function (e) {
                e.preventDefault()
                await adicionarMaterial()
            })
        }

        carregarMateriais()
    }, 100)

    return h
}

// ============================================================
// ADICIONAR MATERIAL
// ============================================================

async function adicionarMaterial() {
    const nrInput = $('#addMatNR')
    const tituloInput = $('#addMatTitulo')
    const descricaoInput = $('#addMatDesc')
    const tipoInput = $('#addMatTipo')
    const arquivoInput = $('#addMatArquivo')
    const urlInput = $('#addMatUrl')

    if (!nrInput || !tituloInput || !descricaoInput || !tipoInput || !arquivoInput || !urlInput) {
        toast('Não foi possível localizar os campos do formulário.', 'err')
        return
    }

    const nrId = Number(nrInput.value)
    const titulo = tituloInput.value.trim()
    const descricao = descricaoInput.value.trim()
    const tipo = tipoInput.value
    const arquivo = arquivoInput.files[0]
    const url = urlInput.value.trim()

    if (!NRS.some(nr => nr.n === nrId)) {
        toast('Selecione uma NR válida.', 'err')
        return
    }

    if (!titulo) {
        toast('Título é obrigatório', 'err')
        return
    }

    if (tipo === 'arquivo' && !arquivo) {
        toast('Selecione um arquivo', 'err')
        return
    }

    if (tipo === 'link' && !url) {
        toast('Insira um link', 'err')
        return
    }

    let urlFinal = url

    if (arquivo) {
        if (arquivo.size > 20 * 1024 * 1024) {
            toast('Arquivo muito grande (máx. 20MB)', 'err')
            return
        }

        const nomeArquivo = arquivo.name.replace(/[\\/]/g, '_')
        const path = `materiais/${uid()}/${Date.now()}_${nomeArquivo}`

        const { error: uploadError } = await sbUploadArquivo(
            STORAGE_BUCKET,
            path,
            arquivo
        )

        if (uploadError) {
            handleError(uploadError)
            return
        }

        const { data: urlData } = sb.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(path)

        urlFinal = urlData.publicUrl
    }

    const { error } = await sbCriarMaterial({
        nr_id: nrId,
        titulo: sanitizar(titulo),
        descricao: sanitizar(descricao),
        url: urlFinal,
        tipo,
        criado_por: uid()
    })

    if (error) {
        handleError(error)
        return
    }

    toast('Material adicionado com sucesso!', 'success')

    await enviarNotificacaoTodosAlunos(
        `Novo material disponível: "${titulo}" na NR ${nrId}`,
        'materiais'
    )

    tituloInput.value = ''
    descricaoInput.value = ''
    arquivoInput.value = ''
    urlInput.value = ''

    await carregarMateriais()
}

// ============================================================
// EDITAR MATERIAL
// ============================================================

window.editarMaterial = async function (
    id,
    tituloAtual,
    descricaoAtual,
    urlAtual,
    nrAtual
) {
    const modal = document.createElement('div')

    modal.style.cssText = `
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    `

    const tituloSeguro = sanitizar(tituloAtual || '')
    const descricaoSegura = sanitizar(descricaoAtual || '')
    const urlSegura = sanitizar(urlAtual || '')
    const nrSelecionada = Number(nrAtual)

    modal.innerHTML = `
        <div style="background:white;padding:30px;border-radius:12px;max-width:500px;width:90%;max-height:80vh;overflow-y:auto;">
            <h2 style="color:#1f2937;margin-top:0;">Editar Material</h2>
            <form id="formEditarMaterial">
                <div style="margin-bottom:15px;">
                    <label style="display:block;color:#374151;margin-bottom:5px;">NR</label>
                    <select id="editMatNR" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;">
                        ${NRS.map(n => `
                            <option value="${n.n}" ${n.n === nrSelecionada ? 'selected' : ''}>
                                NR ${n.n} — ${n.nome}
                            </option>
                        `).join('')}
                    </select>
                </div>
                <div style="margin-bottom:15px;">
                    <label style="display:block;color:#374151;margin-bottom:5px;">Título</label>
                    <input type="text" id="editTitulo" value="${tituloSeguro}" required style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;">
                </div>
                <div style="margin-bottom:15px;">
                    <label style="display:block;color:#374151;margin-bottom:5px;">Descrição</label>
                    <textarea id="editDescricao" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;min-height:80px;">${descricaoSegura}</textarea>
                </div>
                <div style="margin-bottom:15px;">
                    <label style="display:block;color:#374151;margin-bottom:5px;">URL</label>
                    <input type="url" id="editUrl" value="${urlSegura}" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;">
                </div>
                <div style="margin-bottom:15px;">
                    <label style="display:block;color:#374151;margin-bottom:5px;">Tipo</label>
                    <select id="editTipo" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;">
                        <option value="arquivo">Arquivo</option>
                        <option value="link">Link</option>
                    </select>
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button type="button" id="cancelarEdicaoMaterial" style="padding:10px 20px;background:#6b7280;color:white;border:none;border-radius:6px;cursor:pointer;">
                        Cancelar
                    </button>
                    <button type="submit" style="padding:10px 20px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;">
                        Salvar
                    </button>
                </div>
            </form>
        </div>
    `

    document.body.appendChild(modal)

    const form = modal.querySelector('#formEditarMaterial')
    const cancelar = modal.querySelector('#cancelarEdicaoMaterial')
    const tipoSelect = modal.querySelector('#editTipo')

    cancelar.addEventListener('click', () => modal.remove())

    // Seleciona o tipo atual com base nos dados existentes, quando possível.
    tipoSelect.value = urlAtual ? 'link' : 'arquivo'

    form.addEventListener('submit', async e => {
        e.preventDefault()

        const nr_id = Number(modal.querySelector('#editMatNR').value)
        const titulo = modal.querySelector('#editTitulo').value.trim()
        const descricao = modal.querySelector('#editDescricao').value.trim()
        const url = modal.querySelector('#editUrl').value.trim()
        const tipo = tipoSelect.value

        if (!NRS.some(nr => nr.n === nr_id)) {
            toast('Selecione uma NR válida.', 'err')
            return
        }

        if (!titulo) {
            toast('O título é obrigatório.', 'err')
            return
        }

        if (url && !/^https?:\/\//i.test(url)) {
            toast('Informe uma URL iniciando com http:// ou https://.', 'err')
            return
        }

        try {
            const { error } = await sb
                .from('materiais')
                .update({
                    nr_id,
                    titulo: sanitizar(titulo),
                    descricao: sanitizar(descricao),
                    url,
                    tipo,
                    atualizado_em: new Date().toISOString()
                })
                .eq('id', id)

            if (error) {
                handleError(error)
                return
            }

            toast('Material atualizado com sucesso!', 'success')
            modal.remove()
            await carregarMateriais()
        } catch (error) {
            handleError(error)
        }
    })
}

// ============================================================
// EXCLUIR MATERIAL
// ============================================================

window.excluirMaterial = async function (id) {
    if (!confirm('Tem certeza que deseja excluir este material?')) {
        return
    }

    try {
        const { error } = await sb
            .from('materiais')
            .delete()
            .eq('id', id)

        if (error) {
            handleError(error)
            return
        }

        toast('Material excluído com sucesso!', 'success')
        await carregarMateriais()
    } catch (error) {
        handleError(error)
    }
}

// ============================================================
// ENVIAR NOTIFICAÇÕES
// ============================================================

async function enviarNotificacaoTodosAlunos(mensagem, link) {
    const { data: alunos, error } = await sbGetAlunos()

    if (error) {
        handleError(error)
        return
    }

    if (!alunos || alunos.length === 0) {
        return
    }

    for (const aluno of alunos) {
        const { error: notificacaoError } = await sbCriarNotificacao(
            aluno.id,
            'Novo Material',
            mensagem,
            link
        )

        if (notificacaoError) {
            console.error('Erro ao notificar aluno:', notificacaoError)
        }
    }

    if (S.user && (isAdmin() || isProf())) {
        const { error: notificacaoError } = await sbCriarNotificacao(
            S.user.id,
            'Material adicionado',
            `Você adicionou: ${mensagem}`,
            link
        )

        if (notificacaoError) {
            console.error('Erro ao criar notificação:', notificacaoError)
        }
    }
}

// ============================================================
// CARREGAR MATERIAIS
// ============================================================

export async function carregarMateriais() {
    const container = $('#materiaisGrid')

    if (!container) return

    const { data: materiais, error } = await sbGetMateriais()

    if (error) {
        console.error('Erro ao carregar materiais:', error)
        container.innerHTML = `<div class="empty"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar materiais</p></div>`
        return
    }

    const materiaisPorNR = {}

    NRS.forEach(nr => {
        materiaisPorNR[nr.n] = []
    })

    if (materiais) {
        materiais.forEach(material => {
            const nrId = Number(material.nr_id)

            if (materiaisPorNR[nrId]) {
                materiaisPorNR[nrId].push(material)
            }
        })
    }

    let html = ''

    NRS.forEach(nr => {
        const items = materiaisPorNR[nr.n] || []

        html += `<div class="nr-c" style="flex-direction:column;align-items:stretch;gap:4px;cursor:default;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">
                <div class="nr-ic"><i class="fas fa-hard-hat"></i></div>
                <div>
                    <div class="nr-num">NR ${nr.n}</div>
                    <div class="nr-nm">${nr.nome}</div>
                </div>
                <span class="badge bg-info" style="margin-left:auto;">${items.length} materiais</span>
            </div>
            ${items.length === 0 ? `<p style="font-size:12px;color:var(--tx3);padding:4px 0;">Nenhum material disponível.</p>` : ''}
            ${items.map(material => {
                const dadosEdicao = JSON.stringify([
                    String(material.id),
                    material.titulo || '',
                    material.descricao || '',
                    material.url || '',
                    String(material.nr_id)
                ]).replace(/</g, '\\u003c')

                const dadosEdicaoSeguro = sanitizar(dadosEdicao)
                const urlSeguro = sanitizar(material.url || '')
                const tituloSeguro = sanitizar(material.titulo || '')

                return `
                    <div style="display:flex;align-items:center;gap:10px;padding:6px 8px;background:var(--ip);border-radius:8px;border:1px solid var(--bd);margin-top:4px;flex-wrap:wrap;">
                        <i class="fas ${material.tipo === 'arquivo' ? 'fa-file' : 'fa-link'}" style="color:var(--p);"></i>
                        <span style="flex:1;font-size:13px;font-weight:500;">${tituloSeguro}</span>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                            <button class="btn btn-sm btn-p" data-url="${urlSeguro}" onclick="estudarMaterial(this.dataset.url)">
                                <i class="fas fa-book-open"></i> Estudar
                            </button>
                            ${(isAdmin() || isProf()) ? `
                                <button class="btn btn-sm btn-warning" data-dados="${dadosEdicaoSeguro}" onclick="editarMaterial(...JSON.parse(this.dataset.dados))" style="background:#f59e0b;color:white;">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-danger" data-id="${sanitizar(String(material.id))}" onclick="excluirMaterial(this.dataset.id)" style="background:#ef4444;color:white;">
                                    <i class="fas fa-trash"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `
            }).join('')}
        </div>`
    })

    container.innerHTML = html || `<div class="empty"><i class="fas fa-file-alt"></i><p>Nenhum material disponível ainda.</p></div>`
}

// ============================================================
// ESTUDAR MATERIAL
// ============================================================

export function estudarMaterial(url) {
    if (!url || url === 'null' || url === 'undefined') {
        toast('Material sem link válido', 'err')
        return
    }

    let parsedUrl

    try {
        parsedUrl = new URL(url, window.location.origin)
    } catch {
        toast('Link do material inválido.', 'err')
        return
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        toast('Tipo de link não permitido.', 'err')
        return
    }

    window.open(parsedUrl.href, '_blank', 'noopener,noreferrer')
}

// ============================================================
// EXPORTAR FUNÇÕES PARA USO GLOBAL
// ============================================================

window.estudarMaterial = estudarMaterial
window.carregarMateriais = carregarMateriais

console.log('Materiais.js carregado com sucesso.')