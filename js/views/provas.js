// ============================================================
// VIEW: PROVAS (Aluno / Professor)
// ============================================================
import { S, role, uid, nav, fmtD, NRS } from '../state.js'
import { sbEnviarProva, sbGetProvasPendentes, sbCorrigirProva, sbGetProvasAluno, sbGetProvasDirecionadasAluno, sbUploadArquivo, STORAGE_BUCKET } from '../supabase-client.js'
import { openMdl, closeMdl, $, $$, toast, sanitizar, handleError } from '../utils.js'

export function vProvas() {
    const r = role()
    let h = `<div class="btn-back" onclick="window.nav('inicio')"><i class="fas fa-arrow-left"></i> Voltar</div>`
    h += `<h2 class="wc">${r === 'aluno' ? 'Minhas Provas & Atividades' : 'Corrigir Avaliações'}</h2>`
    
    if (r === 'aluno') {
        h += `<p class="wcs">Envie sua avaliação ou trabalho prático em PDF para correção dos instrutores.</p>`
        h += `<div id="provasDirecionadasAluno"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando provas e testes direcionados...</p></div></div>`
        h += `<div class="pnl"><div class="pnl-h"><div class="pnl-t"><i class="fas fa-upload"></i> Enviar Nova Prova</div></div>
            <form id="frmEnviarProva" onsubmit="enviarProva(event)">
                <div class="fld"><label>Norma Regulamentadora (NR)</label>
                    <select id="pNR" required>
                        ${NRS.map(n => `<option value="${n.n}">NR ${n.n} — ${sanitizar(n.nome)}</option>`).join('')}
                    </select>
                </div>
                <div class="fld"><label>Título da Atividade / Prova</label>
                    <input type="text" id="pTitulo" placeholder="Ex: Avaliação Teórica NR 10 - Segurança em Eletricidade" required>
                </div>
                <div class="fld"><label>Arquivo PDF (até 15MB)</label>
                    <input type="file" id="pArquivo" accept=".pdf" required>
                </div>
                <button type="submit" class="btn btn-p btn-block" id="btnSubmeterProva"><i class="fas fa-paper-plane"></i> Enviar para Correção</button>
            </form>
        </div>`
        h += `<div id="minhasProvas"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando histórico de provas...</p></div></div>`
        setTimeout(carregarProvasDirecionadasAluno, 150)
        setTimeout(carregarMinhasProvas, 150)
    } else {
        h += `<p class="wcs">Avalie e lance notas para as atividades enviadas pelos alunos.</p>`
        h += `<div id="provasPendentes"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando provas aguardando correção...</p></div></div>`
        setTimeout(carregarProvasPendentes, 150)
    }
    return h
}

async function carregarProvasDirecionadasAluno() {
    const container = document.getElementById('provasDirecionadasAluno')
    if (!container) return

    const { data: provas, error } = await sbGetProvasDirecionadasAluno()

    if (error) {
        console.error('Erro ao carregar provas direcionadas:', error)
        container.innerHTML = `
            <div class="pnl" style="border-left:4px solid #EF6C00">
                <div class="pnl-t"><i class="fas fa-triangle-exclamation" style="color:#EF6C00"></i> Provas e testes direcionados</div>
                <p style="font-size:12px;color:var(--tx3);margin-top:8px">Não foi possível carregar as provas direcionadas.</p>
            </div>
        `
        return
    }

    if (!provas || provas.length === 0) {
        container.innerHTML = ''
        return
    }

    container.innerHTML = `<div class="pnl">
        <div class="pnl-h"><div class="pnl-t"><i class="fas fa-bullseye"></i> Provas e Testes Direcionados para Você</div></div>
        <div class="tw"><table>
            <thead><tr><th>Título</th><th>NR</th><th>Tipo</th><th>Origem</th><th>Prazo</th><th>Arquivo</th></tr></thead>
            <tbody>
                ${provas.map(prova => {
                    const origem = prova.turma_id
                        ? `Turma: ${sanitizar(prova.turmas?.nome || '')}`
                        : 'Individual'
                    const prazo = prova.prazo
                        ? new Date(prova.prazo).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                        : '—'
                    return `<tr>
                        <td><strong>${sanitizar(prova.titulo)}</strong>${prova.descricao ? `<br><span style="font-size:11px;color:var(--tx3)">${sanitizar(prova.descricao)}</span>` : ''}</td>
                        <td>${prova.nr_id ? `NR ${sanitizar(String(prova.nr_id))}` : '—'}</td>
                        <td><span class="badge bg-info">${prova.tipo === 'teste' ? 'Teste' : 'Prova'}</span></td>
                        <td>${origem}</td>
                        <td>${sanitizar(prazo)}</td>
                        <td>${prova.arquivo_url ? `<a href="${sanitizar(prova.arquivo_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-s"><i class="fas fa-file-pdf"></i> Abrir</a>` : '—'}</td>
                    </tr>`
                }).join('')}
            </tbody>
        </table></div>
    </div>`
}

async function enviarProva(e) {
    e.preventDefault()
    const nrId = $('#pNR')?.value
    const titulo = sanitizar($('#pTitulo')?.value?.trim() || '')
    const arquivo = $('#pArquivo')?.files?.[0]
    const btn = $('#btnSubmeterProva')
    
    if (!arquivo) { toast('Selecione um arquivo PDF', 'err'); return }
    if (arquivo.type !== 'application/pdf') { toast('Formato inválido. Envie um arquivo PDF.', 'err'); return }
    if (arquivo.size > 15 * 1024 * 1024) { toast('Arquivo muito grande. Máximo 15MB.', 'err'); return }
    
    if (btn) {
        btn.disabled = true
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando arquivo...'
    }

    try {
        const path = `provas/${uid()}/${Date.now()}_${arquivo.name.replace(/\s+/g, '_')}`
        const { data: uploadData, error: uploadError } = await sbUploadArquivo(STORAGE_BUCKET, path, arquivo)
        if (uploadError) throw uploadError
        
        const fileUrl = uploadData?.publicUrl || ''
        const { error } = await sbEnviarProva(uid(), nrId, titulo, fileUrl)
        if (error) throw error
        
        toast('Prova enviada com sucesso! Aguarde a avaliação.', 'success')
        if ($('#pTitulo')) $('#pTitulo').value = ''
        if ($('#pArquivo')) $('#pArquivo').value = ''
        carregarMinhasProvas()
    } catch (error) {
        handleError(error)
    } finally {
        if (btn) {
            btn.disabled = false
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar para Correção'
        }
    }
}

async function carregarMinhasProvas() {
    const container = document.getElementById('minhasProvas')
    if (!container) return
    const { data: provas } = await sbGetProvasAluno(uid())
    
    if (!provas || provas.length === 0) {
        container.innerHTML = `
            <div class="empty">
                <i class="fas fa-file-pdf"></i>
                <h4>Nenhuma prova enviada</h4>
                <p>Quando você submeter uma avaliação, ela ficará listada aqui com o status de correção.</p>
            </div>
        `
        return
    }
    
    let h = `<div class="tw"><table><thead><tr><th>NR</th><th>Título</th><th>Status</th><th>Nota</th><th>Arquivo</th><th>Data</th></tr></thead><tbody>`
    provas.forEach(p => {
        const statusCor = p.status === 'corrigido' ? 'bg-ok' : p.status === 'reprovado' ? 'bg-err' : 'bg-pendente'
        const statusTexto = p.status === 'corrigido' ? 'Aprovado / Corrigido' : p.status === 'reprovado' ? 'Revisão Solicitada' : 'Aguardando Correção'
        h += `<tr>
            <td><strong>NR ${p.nr_id}</strong></td>
            <td>${sanitizar(p.titulo) || 'Atividade Prática'}</td>
            <td><span class="badge ${statusCor}">${statusTexto}</span></td>
            <td><strong>${p.nota !== null && p.nota !== undefined ? p.nota : '—'}</strong></td>
            <td>${p.arquivo_url ? `<a href="${p.arquivo_url}" target="_blank" class="btn btn-sm btn-s"><i class="fas fa-download"></i> Ver PDF</a>` : '—'}</td>
            <td>${fmtD(p.criado_em)}</td>
        </tr>`
    })
    h += `</tbody></table></div>`
    container.innerHTML = h
}

async function carregarProvasPendentes() {
    const container = document.getElementById('provasPendentes')
    if (!container) return
    const { data: provas } = await sbGetProvasPendentes()
    
    if (!provas || provas.length === 0) {
        container.innerHTML = `
            <div class="pnl" style="text-align:center;padding:40px">
                <i class="fas fa-check-circle" style="font-size:42px;color:var(--p);margin-bottom:12px;display:block"></i>
                <h4 style="font-size:16px;font-weight:700">Tudo em dia!</h4>
                <p style="color:var(--tx3)">Não há nenhuma avaliação pendente de correção no momento.</p>
            </div>
        `
        return
    }
    
    let h = `<div class="tw"><table><thead><tr><th>Aluno</th><th>NR</th><th>Título</th><th>Arquivo</th><th>Envio</th><th>Ações</th></tr></thead><tbody>`
    provas.forEach(p => {
        h += `<tr>
            <td><strong>${sanitizar(p.profiles?.nome_completo) || 'Aluno'}</strong><br><span style="font-size:11px;color:var(--tx3)">${sanitizar(p.profiles?.email) || ''}</span></td>
            <td>NR ${p.nr_id}</td>
            <td>${sanitizar(p.titulo) || 'Prova'}</td>
            <td>${p.arquivo_url ? `<a href="${p.arquivo_url}" target="_blank" class="btn btn-sm btn-s"><i class="fas fa-file-pdf"></i> Abrir PDF</a>` : '—'}</td>
            <td>${fmtD(p.criado_em)}</td>
            <td>
                <button class="btn btn-sm btn-p" onclick="abrirCorrecao('${p.id}')"><i class="fas fa-check"></i> Avaliar</button>
            </td>
        </tr>`
    })
    h += `</tbody></table></div>`
    container.innerHTML = h
}

function abrirCorrecao(provaId) {
    openMdl(`<button class="mdl-x" onclick="window.closeMdl()"><i class="fas fa-times"></i></button>
        <h2 style="font-size:18px;font-weight:700;color:var(--p);margin-bottom:16px"><i class="fas fa-pen-nib"></i> Avaliar e Lançar Nota</h2>
        <div class="fld"><label>Nota da Avaliação (0.0 a 10.0)</label>
            <input type="number" id="corrNota" min="0" max="10" step="0.1" placeholder="Ex: 8.5" required>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
            <button class="btn btn-p" style="flex:1" onclick="finalizarCorrecao('${provaId}','aprovado')"><i class="fas fa-check"></i> Aprovar</button>
            <button class="btn btn-d" style="flex:1" onclick="finalizarCorrecao('${provaId}','reprovado')"><i class="fas fa-times"></i> Reprovar</button>
        </div>
    `)
}

async function finalizarCorrecao(provaId, status) {
    const nota = parseFloat($('#corrNota')?.value)
    if (isNaN(nota) || nota < 0 || nota > 10) { toast('Informe uma nota válida entre 0 e 10', 'err'); return }
    
    const statusFinal = status === 'aprovado' ? 'corrigido' : 'reprovado'
    const { error } = await sbCorrigirProva(provaId, nota, statusFinal)
    if (error) { handleError(error); return }
    
    toast('Prova corrigida com sucesso! Nota: ' + nota, 'success')
    closeMdl()
    carregarProvasPendentes()
}

window.enviarProva = enviarProva
window.abrirCorrecao = abrirCorrecao
window.finalizarCorrecao = finalizarCorrecao
