// ============================================================
// VIEW: MEU DOSSIÊ SISTEC
// ============================================================
import { S, nav } from '../state.js'
import {
    sbGetMeuDossie,
    sbGetDocumentosAluno,
    sbSalvarMeuDossie,
    sbUploadDocumentoAluno,
    sbDefinirFotoPerfil,
    sbCriarUrlDocumento,
    sbExcluirDocumentoAluno,
    LIMITE_DOCUMENTO_BYTES
} from '../supabase-client.js'
import {
    handleError,
    toast,
    sanitizar,
    openMdl,
    $
} from '../utils.js'
import {
    DOCUMENTOS_DOSSIE,
    TIPOS_DOCUMENTO_OBRIGATORIOS,
    CORES_RACA,
    IDENTIDADES_GENERO,
    TIPOS_DEFICIENCIA,
    FORMAS_ACESSO,
    SEXOS,
    mascararCpf,
    somenteDigitos,
    validarCpf,
    labelDocumento,
    statusDossieInfo,
    statusDocumentoInfo,
    migrationPendente,
    mensagemMigration
} from '../dossie-constants.js'

let documentosCache = []

function opcoes(lista, valorAtual, rotuloVazio = 'Selecione') {
    const atual = String(valorAtual || '')
    const itens = lista.map(item => {
        const valor = sanitizar(item)
        return `<option value="${valor}"${valor === atual ? ' selected' : ''}>${valor}</option>`
    })

    if (atual && !lista.includes(atual)) {
        itens.unshift(`<option value="${sanitizar(atual)}" selected>${sanitizar(atual)}</option>`)
    }

    return `<option value="">${rotuloVazio}</option>${itens.join('')}`
}

function statusBadge(status, tipo = 'dossie') {
    const info = tipo === 'documento'
        ? statusDocumentoInfo(status)
        : statusDossieInfo(status)

    return `<span class="badge ${info.classe}">${info.label}</span>`
}

function perfilCompleto(perfil) {
    return Boolean(
        perfil?.cpf &&
        perfil?.data_nascimento &&
        perfil?.cor_raca &&
        perfil?.renda_per_capita !== null &&
        perfil?.renda_per_capita !== undefined &&
        perfil?.identidade_genero &&
        perfil?.tipo_deficiencia &&
        perfil?.forma_acesso &&
        perfil?.foto_url
    )
}

function progressoDossie(perfil, documentos) {
    const campos = [
        perfil?.cpf,
        perfil?.data_nascimento,
        perfil?.cor_raca,
        perfil?.renda_per_capita,
        perfil?.identidade_genero,
        perfil?.tipo_deficiencia,
        perfil?.forma_acesso
    ]

    const dadosOk = campos.filter(valor => valor !== null && valor !== undefined && valor !== '').length
    const docsOk = TIPOS_DOCUMENTO_OBRIGATORIOS.filter(tipo =>
        documentos.some(doc => doc.tipo_documento === tipo && doc.status === 'aprovado')
    ).length

    const total = campos.length + TIPOS_DOCUMENTO_OBRIGATORIOS.length
    const feitos = dadosOk + docsOk

    return {
        dadosOk,
        dadosTotal: campos.length,
        docsOk,
        docsTotal: TIPOS_DOCUMENTO_OBRIGATORIOS.length,
        percentual: total ? Math.round(feitos / total * 100) : 0
    }
}

function mensagemErroDossie(error) {
    if (migrationPendente(error)) return mensagemMigration()

    const mensagem = String(error?.message || '')

    if (error?.code === '23505' || /cpf.*duplic|profiles_cpf_uidx|já cadastrado/i.test(mensagem)) {
        return 'Este CPF já está vinculado a outro perfil. Procure a secretaria.'
    }

    return mensagem || 'Não foi possível concluir a operação.'
}

function renderDocumento(doc, item) {
    const status = doc?.status || 'pendente'
    const nome = doc?.nome_arquivo ? sanitizar(doc.nome_arquivo) : ''
    const observacao = doc?.observacao ? sanitizar(doc.observacao) : ''
    const podeExcluir = doc && status !== 'aprovado'
    const foto = item.tipo === 'FOTO_3X4'

    return `
        <div class="dossie-doc">
            <div class="dossie-doc-info">
                <div class="dossie-doc-titulo">
                    <i class="fas ${foto ? 'fa-camera' : 'fa-file-lines'}"></i>
                    ${sanitizar(item.label)}
                    ${item.obrigatorio ? '<span class="dossie-obrig">obrigatório</span>' : '<span class="dossie-opcional">opcional</span>'}
                </div>
                <p>${sanitizar(item.descricao)}</p>
                ${nome ? `<small>Arquivo: ${nome}</small>` : '<small>Nenhum arquivo enviado.</small>'}
                ${observacao ? `<small class="dossie-obs">Observação: ${observacao}</small>` : ''}
            </div>
            <div class="dossie-doc-acoes">
                ${doc ? statusBadge(status, 'documento') : '<span class="badge bg-info">Não enviado</span>'}
                ${doc ? `
                    <button class="btn btn-sm btn-s" onclick="window.verDocumentoDossie('${sanitizar(String(doc.id))}')">
                        <i class="fas fa-eye"></i> Ver
                    </button>
                ` : ''}
                ${foto ? `
                    <label class="btn btn-sm btn-p">
                        <i class="fas fa-upload"></i> ${doc ? 'Reenviar' : 'Enviar'}
                        <input type="file" accept="${item.aceita}" style="display:none" onchange="window.enviarFotoDossie(this)">
                    </label>
                ` : `
                    <label class="btn btn-sm btn-p">
                        <i class="fas fa-upload"></i> ${doc ? 'Reenviar' : 'Enviar'}
                        <input type="file" accept="${item.aceita}" style="display:none" onchange="window.enviarDocumentoDossie('${item.tipo}', this)">
                    </label>
                `}
                ${podeExcluir ? `
                    <button class="btn btn-sm btn-d" onclick="window.excluirDocumentoDossie('${sanitizar(String(doc.id))}')">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : ''}
            </div>
        </div>
    `
}

function renderDossie(perfil, documentos, erroDocumentos) {
    const wrap = $('#dossieWrap')
    if (!wrap) return

    const progresso = progressoDossie(perfil, documentos)
    const status = perfil?.dossie_status || 'pendente'
    const statusInfo = statusDossieInfo(status)
    const fotoPath = perfil?.foto_url || documentos.find(doc => doc.tipo_documento === 'FOTO_3X4')?.arquivo_path || ''
    const fotoUrl = fotoPath && /^https?:\/\//i.test(fotoPath) ? fotoPath : ''
    const migracao = migrationPendente(erroDocumentos)
    const aprovado = perfilCompleto(perfil) && progresso.docsOk === progresso.docsTotal

    let h = ''

    if (migracao) {
        h += `
            <div class="dossie-alerta">
                <i class="fas fa-triangle-exclamation"></i>
                <div>
                    <strong>Migration pendente</strong>
                    <p>${sanitizar(mensagemMigration())}</p>
                </div>
            </div>
        `
    }

    h += `
        <div class="dossie-resumo">
            <div>
                <span class="dossie-resumo-label">Situação do dossiê</span>
                <div class="dossie-resumo-status">
                    ${statusBadge(status)}
                    ${aprovado ? '<span class="dossie-ok"><i class="fas fa-check-circle"></i> Dados e documentos completos</span>' : ''}
                </div>
                ${perfil?.dossie_observacoes ? `<p class="dossie-obs">${sanitizar(perfil.dossie_observacoes)}</p>` : ''}
            </div>
            <div class="dossie-progresso">
                <div class="dossie-progresso-topo">
                    <span>Preenchimento</span>
                    <strong>${progresso.percentual}%</strong>
                </div>
                <div class="prog-bar"><div class="prog-fill" style="width:${progresso.percentual}%"></div></div>
                <small>${progresso.dadosOk}/${progresso.dadosTotal} dados · ${progresso.docsOk}/${progresso.docsTotal} documentos aprovados</small>
            </div>
        </div>

        <div class="dossie-cols">
            <div class="pnl">
                <div class="pnl-h"><div class="pnl-t"><i class="fas fa-id-card"></i> Dados do aluno</div></div>
                <div class="dossie-grid">
                    <div class="fld dossie-full">
                        <label for="dossieNome">Nome completo</label>
                        <input id="dossieNome" type="text" value="${sanitizar(perfil?.nome_completo || '')}" autocomplete="name">
                    </div>
                    <div class="fld">
                        <label for="dossieCpf">CPF</label>
                        <input id="dossieCpf" type="text" inputmode="numeric" maxlength="14" value="${sanitizar(mascararCpf(perfil?.cpf || ''))}" oninput="window.mascararCpfInput(this)" autocomplete="off">
                    </div>
                    <div class="fld">
                        <label for="dossieNascimento">Data de nascimento</label>
                        <input id="dossieNascimento" type="date" max="${new Date().toISOString().slice(0, 10)}" value="${sanitizar(perfil?.data_nascimento || '')}">
                    </div>
                    <div class="fld">
                        <label for="dossieNomeMae">Nome da mãe</label>
                        <input id="dossieNomeMae" type="text" value="${sanitizar(perfil?.nome_mae || '')}" autocomplete="off">
                    </div>
                    <div class="fld">
                        <label for="dossieNacionalidade">Nacionalidade</label>
                        <input id="dossieNacionalidade" type="text" value="${sanitizar(perfil?.nacionalidade || 'Brasileira')}" autocomplete="country-name">
                    </div>
                    <div class="fld">
                        <label for="dossieSexo">Sexo</label>
                        <select id="dossieSexo">${opcoes(SEXOS, perfil?.sexo)}</select>
                    </div>
                    <div class="fld">
                        <label for="dossieCorRaca">Cor/raça</label>
                        <select id="dossieCorRaca">${opcoes(CORES_RACA, perfil?.cor_raca)}</select>
                    </div>
                    <div class="fld">
                        <label for="dossieRenda">Renda per capita (R$)</label>
                        <input id="dossieRenda" type="number" min="0" step="0.01" value="${perfil?.renda_per_capita ?? ''}" inputmode="decimal">
                    </div>
                    <div class="fld">
                        <label for="dossieIdentidade">Identidade de gênero</label>
                        <select id="dossieIdentidade">${opcoes(IDENTIDADES_GENERO, perfil?.identidade_genero)}</select>
                    </div>
                    <div class="fld">
                        <label for="dossieDeficiencia">Tipo de deficiência</label>
                        <select id="dossieDeficiencia">${opcoes(TIPOS_DEFICIENCIA, perfil?.tipo_deficiencia)}</select>
                    </div>
                    <div class="fld">
                        <label for="dossieFormaAcesso">Forma de acesso</label>
                        <select id="dossieFormaAcesso">${opcoes(FORMAS_ACESSO, perfil?.forma_acesso)}</select>
                    </div>
                </div>
                <div class="dossie-rodape">
                    <small><i class="fas fa-lock"></i> Seus dados são usados apenas para matrícula, certificados e futura integração com o SISTEC.</small>
                    <button class="btn btn-p" onclick="window.salvarDossie()"><i class="fas fa-floppy-disk"></i> Salvar dossiê</button>
                </div>
            </div>

            <div class="pnl">
                <div class="pnl-h"><div class="pnl-t"><i class="fas fa-camera"></i> Foto 3x4</div></div>
                <div class="dossie-foto">
                    ${fotoPath
                        ? `<img src="${fotoUrl ? sanitizar(fotoUrl) : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}" alt="Foto do aluno">`
                        : `<div class="dossie-foto-vazia"><i class="fas fa-user"></i><span>Envie uma foto recente</span></div>`}
                    <p>Use uma foto de frente, com fundo claro, sem óculos escuros ou boné. JPG ou PNG, até 10 MB.</p>
                    ${fotoPath && !fotoUrl ? '<small class="dossie-obs">A prévia será exibida após o upload.</small>' : ''}
                </div>
                <div class="dossie-orientacoes">
                    <h4><i class="fas fa-circle-info"></i> Por que esses dados?</h4>
                    <ul>
                        <li>O SISTEC usa o CPF como identificação principal do estudante.</li>
                        <li>Cor/raça, renda, gênero e deficiência alimentam os indicadores de acesso e permanência.</li>
                        <li>Os documentos ficam em bucket privado e só são vistos por você e pela administração.</li>
                    </ul>
                </div>
            </div>
        </div>

        <div class="pnl">
            <div class="pnl-h">
                <div class="pnl-t"><i class="fas fa-folder-open"></i> Documentos do dossiê</div>
                <span class="badge ${statusInfo.classe}">${statusInfo.label}</span>
            </div>
            <div class="dossie-docs">
                ${DOCUMENTOS_DOSSIE.map(item => renderDocumento(
                    documentos.find(doc => doc.tipo_documento === item.tipo),
                    item
                )).join('')}
            </div>
        </div>
    `

    wrap.innerHTML = h
}

export function vDossie() {
    if (!S.user || (S.user.role && S.user.role !== 'aluno')) return nav('inicio')

    let h = `<div class="btn-back" onclick="window.nav('inicio')"><i class="fas fa-arrow-left"></i> Voltar</div>`
    h += `<div class="god-hd"><h2><i class="fas fa-id-card"></i> Meu Dossiê SISTEC</h2><p>Complete seus dados e envie os documentos para análise da secretaria.</p></div>`
    h += `<div id="dossieWrap"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando dossiê...</p></div></div>`

    setTimeout(carregarDossie, 100)
    return h
}

async function carregarDossie() {
    const wrap = $('#dossieWrap')
    if (!wrap) return

    const { data: perfil, error } = await sbGetMeuDossie()

    if (error || !perfil) {
        wrap.innerHTML = `
            <div class="empty">
                <i class="fas fa-triangle-exclamation"></i>
                <h4>Não foi possível carregar seu perfil</h4>
                <p>${sanitizar(error ? mensagemErroDossie(error) : 'Perfil não encontrado.')}</p>
            </div>
        `
        return
    }

    const { data: documentos, error: documentosError } = await sbGetDocumentosAluno(perfil.id)
    documentosCache = documentos || []

    renderDossie(perfil, documentosCache, documentosError)

    const fotoPath = perfil.foto_url ||
        documentosCache.find(doc => doc.tipo_documento === 'FOTO_3X4')?.arquivo_path

    if (!documentosError && fotoPath && !/^https?:\/\//i.test(fotoPath)) {
        const { data: urlData } = await sbCriarUrlDocumento(fotoPath, 900)
        const img = document.querySelector('.dossie-foto img')
        if (img && urlData?.signedUrl) img.src = urlData.signedUrl
    }
}

window.mascararCpfInput = function (input) {
    input.value = mascararCpf(input.value)
}

window.salvarDossie = async function () {
    const nome = $('#dossieNome')?.value?.trim()
    const cpf = somenteDigitos($('#dossieCpf')?.value)
    const nascimento = $('#dossieNascimento')?.value
    const corRaca = $('#dossieCorRaca')?.value
    const rendaTexto = $('#dossieRenda')?.value
    const renda = Number(rendaTexto)
    const identidade = $('#dossieIdentidade')?.value
    const deficiencia = $('#dossieDeficiencia')?.value
    const formaAcesso = $('#dossieFormaAcesso')?.value

    if (!nome) {
        toast('Informe seu nome completo.', 'err')
        return
    }

    if (!validarCpf(cpf)) {
        toast('Informe um CPF válido com 11 dígitos.', 'err')
        return
    }

    if (!nascimento) {
        toast('Informe sua data de nascimento.', 'err')
        return
    }

    if (!corRaca || !identidade || !deficiencia || !formaAcesso) {
        toast('Preencha cor/raça, identidade de gênero, deficiência e forma de acesso.', 'err')
        return
    }

    if (rendaTexto === '' || rendaTexto === null || rendaTexto === undefined || !Number.isFinite(renda) || renda < 0) {
        toast('Informe uma renda per capita válida.', 'err')
        return
    }

    const { data, error } = await sbSalvarMeuDossie({
        nome_completo: nome,
        cpf,
        data_nascimento: nascimento,
        cor_raca: corRaca,
        renda_per_capita: renda,
        identidade_genero: identidade,
        tipo_deficiencia: deficiencia,
        forma_acesso: formaAcesso,
        nome_mae: $('#dossieNomeMae')?.value?.trim(),
        nacionalidade: $('#dossieNacionalidade')?.value?.trim() || 'Brasileira',
        sexo: $('#dossieSexo')?.value || null
    })

    if (error) {
        const mensagem = mensagemErroDossie(error)
        if (migrationPendente(error)) toast(mensagem, 'err')
        else handleError(new Error(mensagem))
        return
    }

    S.user = { ...S.user, ...data }
    window.renderSB?.()
    toast('Dossiê salvo. Aguarde a análise da secretaria.', 'success')
    await carregarDossie()
}

window.enviarDocumentoDossie = async function (tipo, input) {
    const file = input?.files?.[0]
    if (!file || !S.user?.id) return

    const item = DOCUMENTOS_DOSSIE.find(doc => doc.tipo === tipo)
    if (!item) return

    if (!item.aceita.split(',').includes(file.type)) {
        toast(`Formato não aceito para ${item.label}. Use ${item.extensoes}.`, 'err')
        input.value = ''
        return
    }

    if (file.size > LIMITE_DOCUMENTO_BYTES) {
        toast('O arquivo deve ter no máximo 10 MB.', 'err')
        input.value = ''
        return
    }

    const anterior = documentosCache.find(doc => doc.tipo_documento === tipo)
    input.value = ''
    input.disabled = true

    const { error } = await sbUploadDocumentoAluno({
        alunoId: S.user.id,
        tipoDocumento: tipo,
        file,
        arquivoAnterior: anterior?.arquivo_path
    })

    input.disabled = false

    if (error) {
        const mensagem = mensagemErroDossie(error)
        if (migrationPendente(error)) toast(mensagem, 'err')
        else handleError(new Error(mensagem))
        return
    }

    toast(`${labelDocumento(tipo)} enviado. Aguardando análise.`, 'success')
    await carregarDossie()
}

window.enviarFotoDossie = async function (input) {
    const file = input?.files?.[0]
    if (!file || !S.user?.id) return

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
        toast('Envie a foto em JPG ou PNG.', 'err')
        input.value = ''
        return
    }

    if (file.size > LIMITE_DOCUMENTO_BYTES) {
        toast('A foto deve ter no máximo 10 MB.', 'err')
        input.value = ''
        return
    }

    const anterior = documentosCache.find(doc => doc.tipo_documento === 'FOTO_3X4')
    input.value = ''
    input.disabled = true

    const { data, error } = await sbUploadDocumentoAluno({
        alunoId: S.user.id,
        tipoDocumento: 'FOTO_3X4',
        file,
        arquivoAnterior: anterior?.arquivo_path
    })

    if (error) {
        input.disabled = false
        const mensagem = mensagemErroDossie(error)
        if (migrationPendente(error)) toast(mensagem, 'err')
        else handleError(new Error(mensagem))
        return
    }

    const { error: fotoError } = await sbDefinirFotoPerfil(data.arquivo_path)

    input.disabled = false

    if (fotoError) {
        const mensagem = mensagemErroDossie(fotoError)
        if (migrationPendente(fotoError)) toast(mensagem, 'err')
        else handleError(new Error(mensagem))
        return
    }

    S.user.foto_url = data.arquivo_path
    toast('Foto atualizada. Aguardando análise.', 'success')
    await carregarDossie()
}

window.verDocumentoDossie = async function (id) {
    const doc = documentosCache.find(item => String(item.id) === String(id))
    if (!doc) return

    const caminho = doc.arquivo_path || doc.arquivo_url
    const { data, error } = await sbCriarUrlDocumento(caminho, 900)

    if (error) {
        handleError(error)
        return
    }

    const url = data?.signedUrl
    if (!url) {
        toast('Não foi possível abrir o documento.', 'err')
        return
    }

    if (String(doc.mime_type || '').startsWith('image/')) {
        openMdl(`
            <button class="mdl-x" onclick="window.closeMdl()"><i class="fas fa-times"></i></button>
            <h3 style="font-size:17px;font-weight:800;margin-bottom:12px">${sanitizar(labelDocumento(doc.tipo_documento))}</h3>
            <img src="${sanitizar(url)}" alt="${sanitizar(labelDocumento(doc.tipo_documento))}" style="width:100%;max-height:70vh;object-fit:contain;border-radius:12px;background:var(--bd2)">
        `, { maxWidth: '760px' })
        return
    }

    window.open(url, '_blank', 'noopener')
}

window.excluirDocumentoDossie = async function (id) {
    const doc = documentosCache.find(item => String(item.id) === String(id))
    if (!doc) return

    if (!confirm(`Excluir o documento "${labelDocumento(doc.tipo_documento)}"?`)) return

    if (doc.tipo_documento === 'FOTO_3X4') {
        const { error: fotoError } = await sbDefinirFotoPerfil(null)
        if (fotoError) {
            handleError(fotoError)
            return
        }

        S.user.foto_url = null
    }

    const { error } = await sbExcluirDocumentoAluno(doc)
    if (error) {
        handleError(error)
        return
    }

    toast('Documento excluído.', 'success')
    await carregarDossie()
}
