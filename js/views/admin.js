// ============================================================
// VIEW: ADMIN (MODO DEUS)
// ============================================================
import { S, nav, fmtD } from '../state.js'
import { sb, sbGetDashboardMetrics, sbGetAllUsers, sbGetRankingAlunos, sbUpdateUser, sbLiberarUsuario, sbBloquearUsuario, sbApagarTudo, sbListarEmpresas, sbCriarEmpresa, sbConvidarUsuarioEmpresa } from '../supabase-client.js'
import { role, isAdmin, uid, toast, handleError, openMdl, closeMdl, sanitizar, $, $$ } from '../utils.js'
import { drawAdminProgress, drawAdminRoles } from '../charts-admin.js'
import {
    PROVEDORES_IA_PROFESSOR,
    CONFIG_IA_PROFESSOR_PADRAO,
    deveMostrarBotaoProfessorIA,
    modoDoSelect,
    provedorDoModo,
    camposVisiveisDoModo,
    textoOrientacaoDoModo,
    normalizarConfigIAProfessor,
    payloadConfigIAProfessor,
    textoSeguro,
    ehProvedorProprio
} from '../ia-professor.js'

export function vAdmin() {
    if (!isAdmin()) return window.nav('inicio')
    let h = `<div class="btn-back" onclick="window.nav('inicio')"><i class="fas fa-arrow-left"></i> Voltar</div>`
    h += `<div class="god-hd"><h2><i class="fas fa-shield-halved"></i> Modo Deus</h2><p>Controle total — ${S.user.email}</p></div>`
    h += `<div id="adminStats"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando dados...</p></div></div>`
    h += `<div class="ch-g"><div class="ch-b"><h3><i class="fas fa-chart-bar"></i> Alunos por Progresso</h3><div class="chart-canvas"><canvas id="chartAdmProg" role="img" aria-label="Alunos por faixa de progresso"></canvas></div></div><div class="ch-b"><h3><i class="fas fa-chart-bar"></i> Distribuição de Roles</h3><div class="chart-canvas"><canvas id="chartAdmRoles" role="img" aria-label="Distribuição de usuários por perfil"></canvas></div></div></div>`
    h += `<div id="adminUsers"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando usuários...</p></div></div>`
    h += `<div class="pnl" id="adminEmpresas"><div class="pnl-h"><div class="pnl-t"><i class="fas fa-building"></i> Empresas e Convites</div></div><div id="empresasCorpo"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando empresas...</p></div></div></div>`
    h += `<div class="pnl" id="pnlIaProfessor"><div class="pnl-h"><div class="pnl-t"><i class="fas fa-wand-magic-sparkles"></i> PROFESSOR I.A — API</div></div><div id="cfgIaCorpo"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando configuração...</p></div></div><div id="btnIaProfessorSlot"></div></div>`
    h += `<div class="pnl" style="border:2px solid #D32F2F"><div class="pnl-h"><div class="pnl-t" style="color:#D32F2F"><i class="fas fa-skull-crossbones"></i> Zona de Perigo</div></div><p style="font-size:13px;color:var(--tx2);margin-bottom:14px">Apaga <strong>TODOS</strong> os dados da plataforma.</p><button class="btn btn-d" style="width: auto;" onclick="modalApagarTudo()"><i class="fas fa-bomb"></i> APAGAR TUDO</button></div>`
    
    setTimeout(carregarAdminData, 200)
    return h
}

async function carregarAdminData() {
    const { data: metrics } = await sbGetDashboardMetrics()
    const { data: users } = await sbGetAllUsers(0, 1000)
    const { data: ranking } = await sbGetRankingAlunos()
    const statsDiv = document.getElementById('adminStats')
    if (statsDiv && metrics) {
        statsDiv.innerHTML = `
            <div class="stats">
                ${stC(metrics.total_usuarios || 0, 'Usuários', 'fa-users')}
                ${stC(metrics.total_alunos || 0, 'Alunos', 'fa-user-graduate')}
                ${stC(metrics.total_professores || 0, 'Professores', 'fa-chalkboard-user')}
                ${stC(metrics.pendentes || 0, 'Pendentes', 'fa-user-clock')}
                ${stC(metrics.provas_pendentes || 0, 'Provas Pendentes', 'fa-file-pdf')}
                ${stC(metrics.total_concluidas || 0, 'Aulas Concluídas', 'fa-check-circle')}
            </div>
        `
    }
    
    const usersDiv = document.getElementById('adminUsers')
    if (usersDiv && users) {
        let h = `<div class="pnl"><div class="pnl-h"><div class="pnl-t"><i class="fas fa-users-gear"></i> Gerenciar Usuários (${users.length})</div></div><input class="search" placeholder="Buscar usuário..." oninput="filterU(this.value)"><div class="tw" style="margin-top:14px"><table><thead><tr><th>Nome</th><th>Email</th><th>Role</th><th>Status</th><th>Ações</th></tr></thead><tbody id="uTB">`
        users.forEach(u => {
            const rc = (u.role === 'admin' || u.role === 'super_admin') ? 'bg-warn' : u.role === 'professor' ? 'bg-ok' : 'bg-info'
            const st = u.status === 'ativo' ? 'bg-ok' : u.status === 'pendente' ? 'bg-pendente' : 'bg-err'
            const nome = sanitizar(u.nome_completo || '')
            const email = sanitizar(u.email || '')
            h += `<tr data-un="${nome.toLowerCase()} ${email.toLowerCase()}">
                <td><strong>${nome}</strong></td>
                <td>${email}</td>
                <td><span class="badge ${rc}">${sanitizar(u.role)}</span></td>
                <td><span class="badge ${st}">${sanitizar(u.status || 'pendente')}</span></td>
                <td>
                    ${u.email !== 'sulsafetreinamentos@gmail.com' ? `
                        <select onchange="changeRole('${u.id}',this.value)" style="background:var(--ip);border:1px solid var(--bd);border-radius:8px;padding:4px 8px;font-size:12px;color:var(--tx)">
                            <option value="aluno" ${u.role === 'aluno' ? 'selected' : ''}>Aluno</option>
                            <option value="professor" ${u.role === 'professor' ? 'selected' : ''}>Professor</option>
                        </select>
                        ${u.status === 'pendente' ? `<button class="btn btn-sm btn-p" onclick="window.liberarUsuario('${u.id}')" style="margin-left:4px;"><i class="fas fa-check"></i> Aprovar</button>` : ''}
                        ${u.status === 'ativo' ? `<button class="btn btn-sm btn-warning" style="width:auto;flex:none;margin-left:4px;background:#f59e0b;color:white;" onclick="window.bloquearUsuario('${u.id}')"><i class="fas fa-ban"></i> Bloquear</button>` : ''}
                    ` : '<span style="font-size:11px;color:var(--tx3)">Protegido</span>'}
                </td>
            </tr>`
        })
        h += `</tbody></table></div></div>`
        usersDiv.innerHTML = h
    }
    
    drawAdminProgress('chartAdmProg', ranking || [])
    drawAdminRoles('chartAdmRoles', users || [])
    carregarEmpresas()
    carregarConfigIA()
}

// ============================================================
// EMPRESAS E CONVITES (OPÇÃO A — D-TUTOR-11)
// ============================================================

let empresasCadastradas = []

async function carregarEmpresas() {
    const corpo = document.getElementById('empresasCorpo')
    if (!corpo) return

    const { data, error } = await sbListarEmpresas()
    if (error) {
        corpo.innerHTML = `<p style="font-size:12px;color:var(--tx2)">Não foi possível carregar as empresas: ${textoSeguro(error.message || 'erro desconhecido')}</p>`
        return
    }

    empresasCadastradas = data || []
    let h = `<p style="font-size:12px;color:var(--tx2);line-height:1.6">O convite é enviado por uma Edge Function com <strong>service_role</strong>. O vínculo da empresa entra no JWT como <strong>app_metadata.empresa_id</strong> — o navegador nunca envia esse claim.</p>`

    if (empresasCadastradas.length) {
        h += `<div class="tw" style="margin-bottom:14px"><table><thead><tr><th>Empresa</th><th>Status</th><th>Cadastrada em</th></tr></thead><tbody>`
        empresasCadastradas.forEach(e => {
            h += `<tr><td><strong>${textoSeguro(e.nome)}</strong></td><td><span class="badge ${e.ativo ? 'bg-ok' : 'bg-err'}">${e.ativo ? 'Ativa' : 'Inativa'}</span></td><td>${e.criado_em ? fmtD(e.criado_em) : '—'}</td></tr>`
        })
        h += `</tbody></table></div>`
    }

    h += `<div style="display:grid;gap:12px;max-width:620px">`
    h += `<div><label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px">Nova empresa</label>
        <input id="empresaNome" placeholder="Nome da empresa" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:8px;padding:10px;color:var(--tx);font-size:13px">
        <button class="btn btn-sm btn-p" style="width:auto;margin-top:8px" onclick="window.criarEmpresa()"><i class="fas fa-plus"></i> Cadastrar empresa</button></div>`

    if (empresasCadastradas.length) {
        h += `<div><label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px">Convidar usuário</label>
            <select id="convEmpresa" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:8px;padding:10px;color:var(--tx);font-size:13px;margin-bottom:8px">
                ${empresasCadastradas.filter(e => e.ativo).map(e => `<option value="${e.id}">${textoSeguro(e.nome)}</option>`).join('')}
            </select>
            <input id="convNome" placeholder="Nome completo" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:8px;padding:10px;color:var(--tx);font-size:13px;margin-bottom:8px">
            <input id="convEmail" type="email" placeholder="email@empresa.com.br" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:8px;padding:10px;color:var(--tx);font-size:13px;margin-bottom:8px">
            <select id="convRole" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:8px;padding:10px;color:var(--tx);font-size:13px;margin-bottom:8px">
                <option value="professor">Professor</option><option value="aluno">Aluno</option>
            </select>
            <button class="btn btn-sm btn-p" style="width:auto" onclick="window.convidarEmpresa()"><i class="fas fa-paper-plane"></i> Enviar convite</button></div>`
    }

    h += `</div>`
    corpo.innerHTML = h
}

async function criarEmpresa() {
    const nome = $('#empresaNome')?.value?.trim()
    if (!nome) { toast('Informe o nome da empresa.', 'err'); return }

    const { error } = await sbCriarEmpresa(nome)
    if (error) { handleError(error); return }

    toast('Empresa cadastrada com sucesso.', 'success')
    carregarEmpresas()
}

async function convidarEmpresa() {
    const empresaId = $('#convEmpresa')?.value
    const nome = $('#convNome')?.value?.trim()
    const email = $('#convEmail')?.value?.trim()
    const role = $('#convRole')?.value || 'professor'

    if (!empresaId || !nome || !email) { toast('Preencha empresa, nome e e-mail.', 'err'); return }

    const { error } = await sbConvidarUsuarioEmpresa({ email, nome, empresaId, role })
    if (error) { handleError(error); return }

    toast('Convite enviado. O usuário receberá o link por e-mail.', 'success')
    carregarAdminData()
}

// ============================================================
// PROFESSOR I.A — CONFIGURAÇÃO BYOA (sem geração implementada)
// ============================================================

let cfgIA = normalizarConfigIAProfessor(CONFIG_IA_PROFESSOR_PADRAO)

async function carregarConfigIA() {
    const corpo = document.getElementById('cfgIaCorpo')
    if (!corpo) return

    try {
        const { data, error } = await sb.rpc('sulsafe_get_config_ia_professor')
        if (error) throw error
        cfgIA = normalizarConfigIAProfessor(Array.isArray(data) ? data[0] : data)
    } catch (erro) {
        cfgIA = normalizarConfigIAProfessor(CONFIG_IA_PROFESSOR_PADRAO)
        corpo.innerHTML = `<p style="font-size:12px;color:var(--tx2)">Configuração indisponível: ${textoSeguro(erro?.message || 'RPC não aplicada')}. Aplique a migration 20261027000000_config_ia_professor.sql.</p>`
        atualizarBotaoIA()
        return
    }

    renderizarConfigIA()
}

function renderizarConfigIA() {
    const corpo = document.getElementById('cfgIaCorpo')
    if (!corpo) return

    const modo = modoDoSelect(cfgIA.provedor)
    const campos = camposVisiveisDoModo(modo)
    const provedorProprio = ehProvedorProprio(cfgIA.provedor) ? cfgIA.provedor : 'openai'

    let h = `<p style="font-size:12px;color:var(--tx2);line-height:1.6;margin-bottom:14px">${textoSeguro(textoOrientacaoDoModo(modo))}</p>`
    h += `<div style="display:grid;gap:12px;max-width:620px">`
    h += `<div><label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px">Modo de uso</label>
        <select id="iaModo" onchange="trocarModoIA()" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:8px;padding:10px;color:var(--tx);font-size:13px">
            <option value="desativado" ${modo === 'desativado' ? 'selected' : ''}>Desativado</option>
            <option value="sulsafe_api" ${modo === 'sulsafe_api' ? 'selected' : ''}>Usar API da SulSafe (cobrada à parte)</option>
            <option value="proprio" ${modo === 'proprio' ? 'selected' : ''}>Usar minha própria API</option>
        </select></div>`

    if (campos.url) {
        h += `<div><label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px">Provedor da API própria</label>
            <select id="iaProvedor" onchange="trocarModoIA()" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:8px;padding:10px;color:var(--tx);font-size:13px">
                ${[PROVEDORES_IA_PROFESSOR.OPENAI, PROVEDORES_IA_PROFESSOR.GEMINI, PROVEDORES_IA_PROFESSOR.ANTHROPIC, PROVEDORES_IA_PROFESSOR.CUSTOM]
                    .map(p => `<option value="${p}" ${provedorProprio === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select></div>`
        h += `<div><label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px">URL base da API (https)</label>
            <input id="iaUrl" type="url" placeholder="https://fabrica.sulsafe.com.br/api" value="${textoSeguro(cfgIA.api_url)}" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:8px;padding:10px;color:var(--tx);font-size:13px"></div>`
        h += `<div><label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px">Chave da API</label>
            <input id="iaChave" type="password" autocomplete="off" placeholder="Enviada uma vez ao Supabase Vault" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:8px;padding:10px;color:var(--tx);font-size:13px">
            <small style="color:var(--tx3)">${cfgIA.chave_configurada ? 'Chave já configurada. Deixe em branco para manter.' : 'Nenhuma chave configurada ainda.'} Nunca salva no navegador.</small></div>`
        h += `<div><label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px">Modelo</label>
            <input id="iaModelo" placeholder="ex.: gemini-2.0-flash, gpt-4o" value="${textoSeguro(cfgIA.modelo)}" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:8px;padding:10px;color:var(--tx);font-size:13px"></div>`
    }

    if (campos.ativo) {
        h += `<label style="display:flex;align-items:center;gap:8px;font-size:13px"><input id="iaAtivo" type="checkbox" ${cfgIA.ativo ? 'checked' : ''}> Ativar Professor I.A (exibe o botão "Criar com I.A")</label>`
    }

    h += `<div><label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px">Observação (opcional)</label>
        <input id="iaObs" placeholder="ex.: Ativação Empresa X — valor negociado" value="${textoSeguro(cfgIA.observacao)}" style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:8px;padding:10px;color:var(--tx);font-size:13px"></div>`
    h += `<div><button class="btn btn-p" style="width:auto" onclick="salvarConfigIA()"><i class="fas fa-floppy-disk"></i> Salvar configuração</button></div>`
    h += `</div>`

    corpo.innerHTML = h
    atualizarBotaoIA()
}

function trocarModoIA() {
    const modo = $('#iaModo')?.value || 'desativado'
    const provedorProprio = $('#iaProvedor')?.value || 'openai'
    cfgIA = normalizarConfigIAProfessor({
        provedor: provedorDoModo(modo, provedorProprio),
        api_url: $('#iaUrl')?.value || '',
        modelo: $('#iaModelo')?.value || '',
        ativo: $('#iaAtivo')?.checked === true,
        chave_configurada: cfgIA.chave_configurada,
        observacao: $('#iaObs')?.value || ''
    })
    renderizarConfigIA()
}

async function salvarConfigIA() {
    const modo = $('#iaModo')?.value || 'desativado'
    const provedorProprio = $('#iaProvedor')?.value || 'openai'
    const config = normalizarConfigIAProfessor({
        provedor: provedorDoModo(modo, provedorProprio),
        api_url: $('#iaUrl')?.value || '',
        modelo: $('#iaModelo')?.value || '',
        ativo: $('#iaAtivo')?.checked === true,
        chave_configurada: cfgIA.chave_configurada,
        observacao: $('#iaObs')?.value || ''
    })
    const payload = payloadConfigIAProfessor(config, $('#iaChave')?.value || '')

    try {
        const { error } = await sb.rpc('sulsafe_configurar_ia_professor', payload)
        if (error) throw error
        const campoChave = $('#iaChave')
        if (campoChave) campoChave.value = ''
        toast('Configuração do Professor I.A salva com segurança.', 'success')
        await carregarConfigIA()
    } catch (erro) {
        toast('Erro ao salvar: ' + textoSeguro(erro?.message || 'erro desconhecido'), 'err')
    }
}

// Botão "Criar com o TUTOR-Sulsafe": some quando a config estiver desativada.
// Quando habilitado, leva à tela de geração com revisão humana.
function atualizarBotaoIA() {
    const slot = document.getElementById('btnIaProfessorSlot')
    if (!slot) return
    slot.innerHTML = deveMostrarBotaoProfessorIA(cfgIA)
        ? '<button class="btn btn-sm btn-p" id="btnCriarComIA" type="button" onclick="window.nav(\'tutor\')"><i class="fas fa-wand-magic-sparkles"></i> Criar com o TUTOR-Sulsafe</button>'
        : ''
}

function filterU(q) { q = q.toLowerCase(); $$('#uTB tr').forEach(r => { r.style.display = r.dataset.un.includes(q) ? '' : 'none' }) }

async function changeRole(id, role) {
    await sbUpdateUser(id, { role: role })
    toast('Role alterado para ' + role, 'success')
    carregarAdminData()
}

function modalApagarTudo() {
    openMdl(`<button class="mdl-x" onclick="window.closeMdl()"><i class="fas fa-times"></i></button><div style="text-align:center;padding:10px 0"><i class="fas fa-skull-crossbones" style="font-size:48px;color:#D32F2F;margin-bottom:12px;display:block"></i><h2 style="font-size:20px;font-weight:800;color:#D32F2F;margin-bottom:8px">Confirmar Apagamento Total</h2><p style="font-size:13px;color:var(--tx2);margin-bottom:6px">Apagará: salas, notas, provas, certificados, aulas e materiais.</p><p style="font-size:12px;color:#D32F2F;font-weight:700;margin-bottom:16px">DIGITE "APAGAR" PARA CONFIRMAR</p><input type="text" id="cfmApagar" placeholder='Digite "APAGAR"' style="width:100%;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);padding:12px;color:var(--tx);font-size:14px;text-align:center;margin-bottom:12px"><button class="btn btn-d btn-block" onclick="execApagar()"><i class="fas fa-bomb"></i> EXECUTAR</button></div>`)
}

async function execApagar() {
    if ($('#cfmApagar')?.value?.trim() !== 'APAGAR') { toast('Digite "APAGAR" para confirmar', 'err'); return }

    // Antes: 7 deletes sequenciais sem transação (podia apagar pela metade).
    // Agora: uma única RPC atômica; se falhar, nada é apagado.
    try {
        const { error } = await sbApagarTudo()
        if (error) throw error

        window.closeMdl()
        toast('TODOS os dados foram apagados!', 'warn')
        carregarAdminData()
    } catch (error) {
        toast('Falha ao apagar: ' + (error?.message || 'erro desconhecido'), 'err')
    }
}


function stC(v, l, ic) {
    return `<div class="st-mod">
        <div class="st-mod-ic"><i class="fas ${ic}"></i></div>
        <div class="st-mod-info">
            <div class="st-mod-v">${v}</div>
            <div class="st-mod-l">${l}</div>
        </div>
    </div>`
}

window.changeRole = changeRole
window.criarEmpresa = criarEmpresa
window.convidarEmpresa = convidarEmpresa
window.liberarUsuario = async function(id) {
    const { data, error } = await sbLiberarUsuario(id)
    if (error) { handleError(error); return }
    toast('Usuário liberado com sucesso!', 'success')
    carregarAdminData()
}
window.bloquearUsuario = async function(id) {
    if (!confirm('Tem certeza que deseja bloquear o acesso deste usuário?')) return;
    const { error } = await sbBloquearUsuario(id);
    if (error) {
        handleError(error);
        return;
    }
    toast('Usuário bloqueado com sucesso!', 'warn');
    carregarAdminData();
}
window.modalApagarTudo = modalApagarTudo
window.execApagar = execApagar
window.trocarModoIA = trocarModoIA
window.salvarConfigIA = salvarConfigIA
window.atualizarBotaoIA = atualizarBotaoIA