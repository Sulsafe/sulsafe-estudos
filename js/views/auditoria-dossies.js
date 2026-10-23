// ============================================================
// VIEW: AUDITORIA DE DOSSIÊS (ADMIN)
// ============================================================
import { isAdmin, nav, stC } from '../state.js'
import {
    sb,
    sbGetAlunosDossie,
    sbAuditarDossie,
    sbAtualizarStatusDocumento,
    sbCriarUrlDocumento,
    sbUploadDocumentoAluno,
    sbAdminSalvarDossie,
    sbAdminDefinirFotoAluno,
    sbAdminMarcarDossiePendente,
    LIMITE_DOCUMENTO_BYTES
} from '../supabase-client.js'
import {
    handleError,
    toast,
    sanitizar,
    openMdl,
    closeMdl,
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
    labelDocumento,
    mascararCpf,
    somenteDigitos,
    validarCpf,
    formatarDataBR,
    formatarRenda,
    statusDossieInfo,
    statusDocumentoInfo,
    migrationPendente,
    mensagemMigration
} from '../dossie-constants.js'

let alunosCache = []
let documentosCache = []
let alunoAtualId = null

function statusBadge(status, tipo = 'dossie') {
    const info = tipo === 'documento'
        ? statusDocumentoInfo(status)
        : statusDossieInfo(status)

    return `<span class="badge ${info.classe}">${info.label}</span>`
}

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

function dadosCompletos(aluno) {
    return Boolean(
        aluno?.cpf &&
        aluno?.data_nascimento &&
        aluno?.cor_raca &&
        aluno?.renda_per_capita !== null &&
        aluno?.renda_per_capita !== undefined &&
        aluno?.identidade_genero &&
        aluno?.tipo_deficiencia &&
        aluno?.forma_acesso &&
        aluno?.foto_url
    )
}

function docsDoAluno(alunoId) {
    return documentosCache.filter(doc => String(doc.aluno_id) === String(alunoId))
}

function docsObrigatoriosAprovados(alunoId) {
    const docs = docsDoAluno(alunoId)

    return TIPOS_DOCUMENTO_OBRIGATORIOS.every(tipo =>
        docs.some(doc => doc.tipo_documento === tipo && doc.status === 'aprovado')
    )
}

function mensagemErroDossie(error) {
    if (migrationPendente(error)) return mensagemMigration()

    const mensagem = String(error?.message || '')

    if (error?.code === '23505' || /cpf.*duplic|já cadastrado/i.test(mensagem)) {
        return 'Este CPF já está vinculado a outro perfil.'
    }

    return mensagem || 'Não foi possível concluir a operação.'
}

function contarDocumentos(alunoId) {
    const docs = docsDoAluno(alunoId)
    const obrigatorios = docs.filter(doc =>
        TIPOS_DOCUMENTO_OBRIGATORIOS.includes(doc.tipo_documento)
    )

    return {
        aprovados: obrigatorios.filter(doc => doc.status === 'aprovado').length,
        pendentes: docs.filter(doc => doc.status === 'pendente').length,
        enviados: obrigatorios.length
    }
}

function linhaAluno(aluno) {
    const status = aluno?.dossie_status || 'pendente'
    const docs = contarDocumentos(aluno.id)
    const nome = sanitizar(aluno?.nome_completo || 'Aluno sem nome')
    const email = sanitizar(aluno?.email || '')
    const cpf = aluno?.cpf ? sanitizar(mascararCpf(aluno.cpf)) : '-'
    const inicial = (aluno?.nome_completo || 'A').trim().charAt(0).toUpperCase()
    const foto = Boolean(aluno?.foto_url) ||
        docsDoAluno(aluno.id).some(doc => doc.tipo_documento === 'FOTO_3X4')

    return `
        <tr class="dossie-linha"
            data-nome="${nome.toLowerCase()} ${email.toLowerCase()}"
            data-cpf="${cpf.replace(/\D/g, '')}"
            data-status="${sanitizar(status)}">
            <td>
                <div class="dossie-aluno">
                    <div class="dossie-avatar">${sanitizar(inicial)}</div>
                    <div>
                        <strong>${nome}</strong>
                        <br><small>${email}</small>
                    </div>
                </div>
            </td>
            <td>${cpf}</td>
            <td>${statusBadge(status)}</td>
            <td>${docs.aprovados}/${TIPOS_DOCUMENTO_OBRIGATORIOS.length} docs</td>
            <td>${foto ? '<i class="fas fa-camera" title="Foto enviada"></i>' : '<span style="color:var(--tx3)">-</span>'}</td>
            <td>
                <button class="btn btn-sm btn-p" onclick="window.abrirDossieAluno('${sanitizar(String(aluno.id))}')">
                    <i class="fas fa-magnifying-glass"></i> Analisar
                </button>
            </td>
        </tr>
    `
}

function renderLista() {
    const container = $('#dossieLista')
    if (!container) return

    if (!alunosCache.length) {
        container.innerHTML = `
            <div class="empty">
                <i class="fas fa-user-graduate"></i>
                <h4>Nenhum aluno cadastrado</h4>
                <p>Os dossiês aparecerão aqui quando houver alunos.</p>
            </div>
        `
        return
    }

    container.innerHTML = `
        <div class="dossie-filtros">
            <input id="dossieBusca" class="search" placeholder="Buscar por nome, email ou CPF..." oninput="window.filtrarDossies()">
            <select id="dossieFiltroStatus" onchange="window.filtrarDossies()">
                <option value="">Todos os status</option>
                <option value="pendente">Pendentes</option>
                <option value="aprovado">Aprovados</option>
                <option value="rejeitado">Rejeitados</option>
            </select>
        </div>
        <div class="tw">
            <table>
                <thead>
                    <tr>
                        <th>Aluno</th>
                        <th>CPF</th>
                        <th>Dossiê</th>
                        <th>Documentos</th>
                        <th>Foto</th>
                        <th>Ação</th>
                    </tr>
                </thead>
                <tbody id="dossieTbody">
                    ${alunosCache.map(linhaAluno).join('')}
                </tbody>
            </table>
        </div>
        <div id="dossieVazio" class="empty" style="display:none">
            <i class="fas fa-magnifying-glass"></i>
            <p>Nenhum dossiê encontrado com esses filtros.</p>
        </div>
    `
}

function renderStats() {
    const container = $('#dossieStats')
    if (!container) return

    const pendentes = alunosCache.filter(aluno => (aluno.dossie_status || 'pendente') === 'pendente').length
    const aprovados = alunosCache.filter(aluno => aluno.dossie_status === 'aprovado').length
    const rejeitados = alunosCache.filter(aluno => aluno.dossie_status === 'rejeitado').length
    const docsPendentes = documentosCache.filter(doc => doc.status === 'pendente').length

    container.innerHTML = `
        <div class="stats">
            ${stC(alunosCache.length, 'Alunos', 'fa-users')}
            ${stC(pendentes, 'Dossiês pendentes', 'fa-user-clock')}
            ${stC(aprovados, 'Dossiês aprovados', 'fa-check-circle')}
            ${stC(rejeitados, 'Dossiês rejeitados', 'fa-circle-xmark')}
            ${stC(docsPendentes, 'Documentos pendentes', 'fa-folder-open')}
        </div>
    `
}

function renderDocumentoAuditoria(doc, item) {
    const status = doc?.status || 'pendente'
    const nome = doc?.nome_arquivo ? sanitizar(doc.nome_arquivo) : 'Não enviado'
    const observacao = doc?.observacao ? sanitizar(doc.observacao) : ''

    return `
        <div class="dossie-mdl-doc">
            <div>
                <strong>${sanitizar(item.label)}</strong>
                ${item.obrigatorio ? '<span class="dossie-obrig">obrigatório</span>' : ''}
                <br><small>${nome}</small>
                ${observacao ? `<br><small class="dossie-obs">Observação: ${observacao}</small>` : ''}
            </div>
            <div class="dossie-mdl-doc-acoes">
                ${doc ? statusBadge(status, 'documento') : '<span class="badge bg-info">Não enviado</span>'}
                ${doc ? `
                    <button class="btn btn-sm btn-s" onclick="window.verDocAuditoria('${sanitizar(String(doc.id))}')">
                        <i class="fas fa-eye"></i> Abrir
                    </button>
                    ${status !== 'aprovado' ? `
                        <button class="btn btn-sm btn-p" onclick="window.alterarStatusDocDossie('${sanitizar(String(doc.id))}', 'aprovado')">
                            <i class="fas fa-check"></i> Aprovar
                        </button>
                    ` : ''}
                    ${status !== 'rejeitado' ? `
                        <button class="btn btn-sm btn-d" onclick="window.alterarStatusDocDossie('${sanitizar(String(doc.id))}', 'rejeitado')">
                            <i class="fas fa-xmark"></i> Rejeitar
                        </button>
                    ` : ''}
                    ${status !== 'pendente' ? `
                        <button class="btn btn-sm btn-s" onclick="window.alterarStatusDocDossie('${sanitizar(String(doc.id))}', 'pendente')">
                            <i class="fas fa-rotate-left"></i> Pendente
                        </button>
                    ` : ''}
                ` : ''}
            </div>
        </div>
    `
}

function renderModal(aluno) {
    const docs = docsDoAluno(aluno.id)
    const status = aluno?.dossie_status || 'pendente'
    const completo = dadosCompletos(aluno) && docsObrigatoriosAprovados(aluno.id)
    const fotoPath = aluno?.foto_url || docs.find(doc => doc.tipo_documento === 'FOTO_3X4')?.arquivo_path || ''
    const fotoUrl = fotoPath && /^https?:\/\//i.test(fotoPath) ? fotoPath : ''

    return `
        <button class="mdl-x" onclick="window.closeMdl()"><i class="fas fa-times"></i></button>
        <div class="dossie-mdl-hd">
            <div class="dossie-mdl-foto" id="dossieMdlFoto">
                ${fotoUrl ? `<img src="${sanitizar(fotoUrl)}" alt="Foto do aluno">` : '<i class="fas fa-user"></i>'}
            </div>
            <div style="flex:1;min-width:0">
                <h2>${sanitizar(aluno?.nome_completo || 'Aluno sem nome')}</h2>
                <p>${sanitizar(aluno?.email || '')} · CPF ${aluno?.cpf ? sanitizar(mascararCpf(aluno.cpf)) : 'não informado'}</p>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
                    ${statusBadge(status)}
                    ${completo ? '<span class="dossie-ok"><i class="fas fa-check-circle"></i> Completo</span>' : '<span class="dossie-pendente"><i class="fas fa-clock"></i> Pendências</span>'}
                </div>
            </div>
        </div>

        <div class="dossie-mdl-toolbar">
            <button class="btn btn-sm btn-s" onclick="window.abrirEdicaoDossie('${sanitizar(String(aluno.id))}')">
                <i class="fas fa-pen"></i> Editar Ficha
            </button>
            <button class="btn btn-sm btn-s" onclick="window.alternarUploadAdmin()">
                <i class="fas fa-paperclip"></i> Anexar Documento
            </button>
        </div>

        ${renderUploadAdmin(aluno)}

        <div class="dossie-mdl-grid">
            <div><span>Nascimento</span><strong>${formatarDataBR(aluno?.data_nascimento)}</strong></div>
            <div><span>Nome da mãe</span><strong>${sanitizar(aluno?.nome_mae || '-')}</strong></div>
            <div><span>Nacionalidade</span><strong>${sanitizar(aluno?.nacionalidade || '-')}</strong></div>
            <div><span>Sexo</span><strong>${sanitizar(aluno?.sexo || '-')}</strong></div>
            <div><span>Cor/raça</span><strong>${sanitizar(aluno?.cor_raca || '-')}</strong></div>
            <div><span>Identidade de gênero</span><strong>${sanitizar(aluno?.identidade_genero || '-')}</strong></div>
            <div><span>Tipo de deficiência</span><strong>${sanitizar(aluno?.tipo_deficiencia || '-')}</strong></div>
            <div><span>Forma de acesso</span><strong>${sanitizar(aluno?.forma_acesso || '-')}</strong></div>
            <div><span>Renda per capita</span><strong>${formatarRenda(aluno?.renda_per_capita)}</strong></div>
        </div>

        <h3 class="dossie-mdl-secao"><i class="fas fa-folder-open"></i> Documentos</h3>
        <div class="dossie-mdl-docs">
            ${DOCUMENTOS_DOSSIE.map(item => renderDocumentoAuditoria(
                docs.find(doc => doc.tipo_documento === item.tipo),
                item
            )).join('')}
        </div>

        <div class="fld">
            <label for="auditObs">Parecer / observações da secretaria</label>
            <textarea id="auditObs" rows="3" placeholder="Informe pendências ou o motivo da rejeição...">${sanitizar(aluno?.dossie_observacoes || '')}</textarea>
        </div>

        <div class="dossie-mdl-acoes">
            <button class="btn btn-p" onclick="window.auditarDossie('${sanitizar(String(aluno.id))}', 'aprovado')" ${completo ? '' : 'disabled title="Aprovação exige dados completos e os 5 documentos obrigatórios aprovados"'}>
                <i class="fas fa-check"></i> Aprovar dossiê
            </button>
            <button class="btn btn-s" onclick="window.auditarDossie('${sanitizar(String(aluno.id))}', 'pendente')">
                <i class="fas fa-clock"></i> Marcar pendente
            </button>
            <button class="btn btn-d" onclick="window.auditarDossie('${sanitizar(String(aluno.id))}', 'rejeitado')">
                <i class="fas fa-xmark"></i> Rejeitar dossiê
            </button>
        </div>
        ${completo ? '' : '<p class="dossie-mdl-aviso">Para aprovar, preencha todos os dados obrigatórios e aprove Foto 3x4, RG, CPF, Histórico escolar e Comprovante de residência.</p>'}
    `
}

function renderUploadAdmin(aluno) {
    const docs = docsDoAluno(aluno.id)
    const faltante = DOCUMENTOS_DOSSIE.find(item =>
        !docs.some(doc => doc.tipo_documento === item.tipo)
    )
    const tipoPadrao = faltante?.tipo || DOCUMENTOS_DOSSIE[0]?.tipo || ''
    const itemPadrao = DOCUMENTOS_DOSSIE.find(item => item.tipo === tipoPadrao)

    return `
        <div id="dossieAdminUpload" class="dossie-mdl-upload" style="display:none">
            <div class="dossie-mdl-upload-hd">
                <strong><i class="fas fa-paperclip"></i> Anexar documento pelo admin</strong>
                <small>Use quando o aluno tiver dificuldade técnica. O arquivo substitui o documento do mesmo tipo e volta para pendente.</small>
            </div>
            <div class="dossie-mdl-upload-form">
                <div class="fld">
                    <label for="dossieAdminTipoDoc">Tipo de documento</label>
                    <select id="dossieAdminTipoDoc" onchange="window.atualizarAceiteUploadAdmin()">
                        ${DOCUMENTOS_DOSSIE.map(item => {
                            const existente = docs.some(doc => doc.tipo_documento === item.tipo)
                            return `<option value="${item.tipo}"${item.tipo === tipoPadrao ? ' selected' : ''}>${sanitizar(item.label)}${existente ? ' (substituir)' : ''}</option>`
                        }).join('')}
                    </select>
                </div>
                <div class="fld">
                    <label for="dossieAdminArquivo">Arquivo</label>
                    <input id="dossieAdminArquivo" type="file" accept="${sanitizar(itemPadrao?.aceita || '')}">
                </div>
                <button class="btn btn-p" onclick="window.enviarDocumentoAdmin('${sanitizar(String(aluno.id))}')">
                    <i class="fas fa-upload"></i> Enviar
                </button>
            </div>
            <p id="dossieAdminUploadHint" class="dossie-mdl-aviso">Formatos aceitos para ${sanitizar(itemPadrao?.label || '')}: ${sanitizar(itemPadrao?.extensoes || '')}. Tamanho máximo: 10 MB.</p>
        </div>
    `
}

function renderModalEdicao(aluno) {
    const status = aluno?.dossie_status || 'pendente'

    return `
        <button class="mdl-x" onclick="window.closeMdl()"><i class="fas fa-times"></i></button>
        <div class="dossie-mdl-hd">
            <div class="dossie-mdl-foto">
                <i class="fas fa-user-pen"></i>
            </div>
            <div style="flex:1;min-width:0">
                <h2>Editar ficha do aluno</h2>
                <p>${sanitizar(aluno?.nome_completo || 'Aluno sem nome')} · ${sanitizar(aluno?.email || '')}</p>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
                    ${statusBadge(status)}
                </div>
            </div>
        </div>

        <div class="dossie-grid">
            <div class="fld dossie-full">
                <label for="dossieAdminNome">Nome completo</label>
                <input id="dossieAdminNome" type="text" value="${sanitizar(aluno?.nome_completo || '')}" autocomplete="name">
            </div>
            <div class="fld">
                <label for="dossieAdminCpf">CPF</label>
                <input id="dossieAdminCpf" type="text" inputmode="numeric" maxlength="14" value="${sanitizar(mascararCpf(aluno?.cpf || ''))}" oninput="window.mascararCpfAdminInput(this)" autocomplete="off">
            </div>
            <div class="fld">
                <label for="dossieAdminNascimento">Data de nascimento</label>
                <input id="dossieAdminNascimento" type="date" max="${new Date().toISOString().slice(0, 10)}" value="${sanitizar(aluno?.data_nascimento || '')}">
            </div>
            <div class="fld">
                <label for="dossieAdminNomeMae">Nome da mãe</label>
                <input id="dossieAdminNomeMae" type="text" value="${sanitizar(aluno?.nome_mae || '')}" autocomplete="off">
            </div>
            <div class="fld">
                <label for="dossieAdminNacionalidade">Nacionalidade</label>
                <input id="dossieAdminNacionalidade" type="text" value="${sanitizar(aluno?.nacionalidade || 'Brasileira')}" autocomplete="country-name">
            </div>
            <div class="fld">
                <label for="dossieAdminSexo">Sexo</label>
                <select id="dossieAdminSexo">${opcoes(SEXOS, aluno?.sexo)}</select>
            </div>
            <div class="fld">
                <label for="dossieAdminCorRaca">Cor/raça</label>
                <select id="dossieAdminCorRaca">${opcoes(CORES_RACA, aluno?.cor_raca)}</select>
            </div>
            <div class="fld">
                <label for="dossieAdminRenda">Renda per capita (R$)</label>
                <input id="dossieAdminRenda" type="number" min="0" step="0.01" value="${aluno?.renda_per_capita ?? ''}" inputmode="decimal">
            </div>
            <div class="fld">
                <label for="dossieAdminIdentidade">Identidade de gênero</label>
                <select id="dossieAdminIdentidade">${opcoes(IDENTIDADES_GENERO, aluno?.identidade_genero)}</select>
            </div>
            <div class="fld">
                <label for="dossieAdminDeficiencia">Tipo de deficiência</label>
                <select id="dossieAdminDeficiencia">${opcoes(TIPOS_DEFICIENCIA, aluno?.tipo_deficiencia)}</select>
            </div>
            <div class="fld">
                <label for="dossieAdminFormaAcesso">Forma de acesso</label>
                <select id="dossieAdminFormaAcesso">${opcoes(FORMAS_ACESSO, aluno?.forma_acesso)}</select>
            </div>
        </div>

        <p class="dossie-mdl-aviso">Ao salvar, o dossiê volta para <strong>pendente</strong> e precisará ser aprovado novamente.</p>

        <div class="dossie-mdl-acoes">
            <button class="btn btn-p" onclick="window.salvarDossieAdmin('${sanitizar(String(aluno.id))}')">
                <i class="fas fa-floppy-disk"></i> Salvar alterações
            </button>
            <button class="btn btn-s" onclick="window.abrirDossieAluno('${sanitizar(String(aluno.id))}')">
                <i class="fas fa-arrow-left"></i> Cancelar
            </button>
        </div>
    `
}

async function carregarAuditoria() {
    const lista = $('#dossieLista')
    if (!lista) return

    const { data: alunos, error } = await sbGetAlunosDossie()

    if (error) {
        lista.innerHTML = `
            <div class="empty">
                <i class="fas fa-triangle-exclamation"></i>
                <h4>Não foi possível carregar os alunos</h4>
                <p>${sanitizar(mensagemErroDossie(error))}</p>
            </div>
        `
        return
    }

    const { data: documentos, error: documentosError } = await sb
        .from('documentos_aluno')
        .select('*')

    alunosCache = alunos || []
    documentosCache = documentos || []

    renderStats()
    renderLista()

    const avisoAnterior = $('#dossieAvisoDocumentos')
    if (avisoAnterior) avisoAnterior.remove()

    if (documentosError) {
        const aviso = document.createElement('div')
        aviso.id = 'dossieAvisoDocumentos'
        aviso.className = 'dossie-alerta'
        aviso.innerHTML = `
            <i class="fas fa-triangle-exclamation"></i>
            <div>
                <strong>Documentos indisponíveis</strong>
                <p>${sanitizar(mensagemErroDossie(documentosError))}</p>
            </div>
        `
        lista.parentNode.insertBefore(aviso, lista)
    }
}

export function vAuditoriaDossies() {
    if (!isAdmin()) return nav('inicio')

    let h = `<div class="btn-back" onclick="window.nav('inicio')"><i class="fas fa-arrow-left"></i> Voltar</div>`
    h += `<div class="god-hd"><h2><i class="fas fa-folder-open"></i> Auditoria de Dossiês</h2><p>Confira dados e documentos antes de aprovar o cadastro SISTEC do aluno.</p></div>`
    h += `<div id="dossieStats"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando indicadores...</p></div></div>`
    h += `<div id="dossieLista"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando dossiês...</p></div></div>`

    setTimeout(carregarAuditoria, 100)
    return h
}

window.filtrarDossies = function () {
    const busca = String($('#dossieBusca')?.value || '').trim().toLowerCase()
    const status = String($('#dossieFiltroStatus')?.value || '')
    const digitos = busca.replace(/\D/g, '')
    let visiveis = 0

    document.querySelectorAll('.dossie-linha').forEach(linha => {
        const texto = linha.dataset.nome || ''
        const cpf = linha.dataset.cpf || ''
        const linhaStatus = linha.dataset.status || ''
        const combinaTexto = !busca || texto.includes(busca) || (digitos && cpf.includes(digitos))
        const combinaStatus = !status || linhaStatus === status
        const visivel = combinaTexto && combinaStatus

        linha.style.display = visivel ? '' : 'none'
        if (visivel) visiveis += 1
    })

    const vazio = $('#dossieVazio')
    if (vazio) vazio.style.display = visiveis ? 'none' : 'block'
}

window.abrirDossieAluno = async function (id) {
    const aluno = alunosCache.find(item => String(item.id) === String(id))
    if (!aluno) return

    alunoAtualId = aluno.id
    openMdl(renderModal(aluno), { maxWidth: '1000px', width: '94%' })

    const docs = docsDoAluno(aluno.id)
    const fotoPath = aluno.foto_url ||
        docs.find(doc => doc.tipo_documento === 'FOTO_3X4')?.arquivo_path

    if (fotoPath && !/^https?:\/\//i.test(fotoPath)) {
        const { data } = await sbCriarUrlDocumento(fotoPath, 900)
        const alvo = $('#dossieMdlFoto')
        if (alvo && data?.signedUrl) {
            alvo.innerHTML = `<img src="${sanitizar(data.signedUrl)}" alt="Foto do aluno">`
        }
    }
}

window.abrirEdicaoDossie = function (id) {
    if (!isAdmin()) return

    const aluno = alunosCache.find(item => String(item.id) === String(id))
    if (!aluno) return

    alunoAtualId = aluno.id
    openMdl(renderModalEdicao(aluno), { maxWidth: '1000px', width: '94%' })
}

window.mascararCpfAdminInput = function (input) {
    if (!input) return
    input.value = mascararCpf(input.value)
}

window.salvarDossieAdmin = async function (alunoId) {
    if (!isAdmin()) return

    const nome = $('#dossieAdminNome')?.value?.trim()
    const cpf = somenteDigitos($('#dossieAdminCpf')?.value)
    const nascimento = $('#dossieAdminNascimento')?.value
    const corRaca = $('#dossieAdminCorRaca')?.value
    const rendaTexto = $('#dossieAdminRenda')?.value
    const renda = Number(rendaTexto)
    const identidade = $('#dossieAdminIdentidade')?.value
    const deficiencia = $('#dossieAdminDeficiencia')?.value
    const formaAcesso = $('#dossieAdminFormaAcesso')?.value

    if (!nome) {
        toast('Informe o nome completo do aluno.', 'err')
        return
    }

    if (!validarCpf(cpf)) {
        toast('Informe um CPF válido com 11 dígitos.', 'err')
        return
    }

    if (!nascimento) {
        toast('Informe a data de nascimento do aluno.', 'err')
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

    const { data, error } = await sbAdminSalvarDossie(alunoId, {
        nome_completo: nome,
        cpf,
        data_nascimento: nascimento,
        cor_raca: corRaca,
        renda_per_capita: renda,
        identidade_genero: identidade,
        tipo_deficiencia: deficiencia,
        forma_acesso: formaAcesso,
        nome_mae: $('#dossieAdminNomeMae')?.value?.trim(),
        nacionalidade: $('#dossieAdminNacionalidade')?.value?.trim() || 'Brasileira',
        sexo: $('#dossieAdminSexo')?.value || null
    })

    if (error) {
        const mensagem = mensagemErroDossie(error)
        if (migrationPendente(error)) toast(mensagem, 'err')
        else handleError(new Error(mensagem))
        return
    }

    toast('Ficha atualizada. O dossiê voltou para pendente.', 'success')

    const aluno = alunosCache.find(item => String(item.id) === String(alunoId))
    if (aluno && data) Object.assign(aluno, data)

    await carregarAuditoria()
    await window.abrirDossieAluno(alunoId)
}

window.alternarUploadAdmin = function () {
    const painel = $('#dossieAdminUpload')
    if (!painel) return

    const abrir = painel.style.display === 'none' || !painel.style.display
    painel.style.display = abrir ? 'block' : 'none'

    if (abrir) window.atualizarAceiteUploadAdmin()
}

window.atualizarAceiteUploadAdmin = function () {
    const tipo = $('#dossieAdminTipoDoc')?.value
    const item = DOCUMENTOS_DOSSIE.find(doc => doc.tipo === tipo)
    const input = $('#dossieAdminArquivo')
    const hint = $('#dossieAdminUploadHint')

    if (input) {
        input.accept = item?.aceita || ''
        input.value = ''
    }

    if (hint) {
        hint.textContent = item
            ? `Formatos aceitos para ${item.label}: ${item.extensoes}. Tamanho máximo: 10 MB.`
            : ''
    }
}

window.enviarDocumentoAdmin = async function (alunoId) {
    if (!isAdmin()) return

    const tipo = $('#dossieAdminTipoDoc')?.value
    const input = $('#dossieAdminArquivo')
    const file = input?.files?.[0]
    const item = DOCUMENTOS_DOSSIE.find(doc => doc.tipo === tipo)

    if (!item || !file) {
        toast('Selecione o tipo de documento e o arquivo.', 'err')
        return
    }

    const aceitos = String(item.aceita || '').split(',').map(valor => valor.trim()).filter(Boolean)

    if (!aceitos.includes(file.type)) {
        toast(`Formato não aceito para ${item.label}. Use ${item.extensoes}.`, 'err')
        input.value = ''
        return
    }

    if (file.size > LIMITE_DOCUMENTO_BYTES) {
        toast('O arquivo deve ter no máximo 10 MB.', 'err')
        input.value = ''
        return
    }

    const anterior = docsDoAluno(alunoId).find(doc => doc.tipo_documento === tipo)
    input.disabled = true

    const { data, error } = await sbUploadDocumentoAluno({
        alunoId,
        tipoDocumento: tipo,
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

    let statusError = null

    if (tipo === 'FOTO_3X4') {
        const { error: fotoError } = await sbAdminDefinirFotoAluno(alunoId, data.arquivo_path)
        statusError = fotoError
    } else {
        const { error: dossieError } = await sbAdminMarcarDossiePendente(alunoId)
        statusError = dossieError
    }

    input.disabled = false

    if (statusError) {
        handleError(new Error(`Documento anexado, mas não foi possível reabrir o dossiê: ${mensagemErroDossie(statusError)}`))
    } else {
        toast(`${labelDocumento(tipo)} anexado. O documento está pendente de aprovação.`, 'success')
    }

    await carregarAuditoria()
    await window.abrirDossieAluno(alunoId)
}

window.verDocAuditoria = async function (id) {
    const doc = documentosCache.find(item => String(item.id) === String(id))
    if (!doc) return

    const { data, error } = await sbCriarUrlDocumento(doc.arquivo_path || doc.arquivo_url, 900)

    if (error) {
        handleError(error)
        return
    }

    if (!data?.signedUrl) {
        toast('Não foi possível abrir o documento.', 'err')
        return
    }

    window.open(data.signedUrl, '_blank', 'noopener')
}

window.alterarStatusDocDossie = async function (docId, status) {
    if (!isAdmin()) return

    const doc = documentosCache.find(item => String(item.id) === String(docId))
    if (!doc) return

    let observacao = null

    if (status === 'rejeitado') {
        observacao = prompt(`Motivo da rejeição de "${labelDocumento(doc.tipo_documento)}":`)

        if (!observacao?.trim()) {
            toast('Informe o motivo da rejeição.', 'err')
            return
        }

        observacao = observacao.trim()
    }

    const { error } = await sbAtualizarStatusDocumento(docId, status, observacao)

    if (error) {
        handleError(new Error(mensagemErroDossie(error)))
        return
    }

    toast('Status do documento atualizado.', 'success')
    await carregarAuditoria()

    if (alunoAtualId) await window.abrirDossieAluno(alunoAtualId)
}

window.auditarDossie = async function (alunoId, status) {
    if (!isAdmin()) return

    const observacao = $('#auditObs')?.value?.trim() || null

    if (status === 'rejeitado' && !observacao) {
        toast('Informe o motivo da rejeição do dossiê.', 'err')
        return
    }

    if (status === 'aprovado' && !confirm('Aprovar este dossiê? Os documentos obrigatórios devem estar aprovados.')) {
        return
    }

    const { data, error } = await sbAuditarDossie(alunoId, status, observacao)

    if (error) {
        handleError(new Error(mensagemErroDossie(error)))
        return
    }

    toast(`Dossiê ${status === 'aprovado' ? 'aprovado' : status === 'rejeitado' ? 'rejeitado' : 'marcado como pendente'}.`, 'success')

    const aluno = alunosCache.find(item => String(item.id) === String(alunoId))
    if (aluno && data) Object.assign(aluno, data)

    closeMdl()
    alunoAtualId = null
    await carregarAuditoria()
}
