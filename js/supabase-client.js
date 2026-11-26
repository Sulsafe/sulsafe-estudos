// ============================================================
// SUPABASE CLIENT + CRUD
// ============================================================
// Versão fixa e alinhada ao package-lock.json (2.118.0).
// Evita divergência entre o código testado no Node e o bundle servido pelo CDN.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0'
import { ADMIN_EMAIL, uid, sanitizar, toast, handleError } from './utils.js'
import { S } from './state.js'

// Configurações
const SUPABASE_URL = 'https://acqbidvknbqppkjidvsq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjcWJpZHZrbmJxcHBramlkdnNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1Njc2NzgsImV4cCI6MjEwMDE0MzY3OH0.W-bAmATd7meg8RyWunmsgfN9nUxj18ya6d4AKx4aG7E'

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
export const STORAGE_BUCKET = 'arquivos'
export const DOCUMENTOS_BUCKET = 'documentos-alunos'
export const LIMITE_DOCUMENTO_BYTES = 10 * 1024 * 1024

// ============================================================
// USUÁRIOS
// ============================================================
export async function sbGetUser(id) {
    try {
        if (!id) throw new Error('Perfil não informado.')

        const { data, error } = await sb.from('profiles')
            .select('*')
            .eq('id', id)
            .single()

        if (!error && data) return { data, error: null }

        const { data: perfilPublico, error: perfilError } = await sb
            .rpc('sulsafe_obter_perfil_publico', { p_id: id })
            .maybeSingle()

        if (!perfilError && perfilPublico) {
            return { data: perfilPublico, error: null }
        }

        throw perfilError || error || new Error('Perfil não encontrado.')
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbUpdateUser(id, dados) {
    try {
        const { data, error } = await sb.from('profiles').update(dados).eq('id', id).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetAllUsers(page = 0, limit = 20) {
    try {
        // AJUSTE: select('*') para evitar erro 500 de coluna
        const { data, error, count } = await sb.from('profiles')
            .select('*', { count: 'exact' })
            .order('nome_completo')
            .range(page * limit, (page + 1) * limit - 1)
        if (error) throw error
        return { data, error: null, count }
    } catch (error) {
        return { data: null, error, count: 0 }
    }
}

export async function sbGetAlunos() {
    try {
        const { data, error } = await sb.rpc('sulsafe_listar_alunos')

        if (!error) return { data: data || [], error: null }

        // Compatibilidade durante o deploy da migration de segurança.
        const fallback = await sb.from('profiles')
            .select('id, nome_completo, email, status')
            .eq('role', 'aluno')
            .order('nome_completo')

        if (fallback.error) throw fallback.error
        return { data: fallback.data || [], error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetPendentes() {
    try {
        const { data, error } = await sb.from('profiles')
            .select('*')
            .eq('status', 'pendente')
            .eq('role', 'aluno')
            .order('criado_em', { ascending: true })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbLiberarUsuario(id) {
    try {
        const { data, error } = await sb.from('profiles').update({ status: 'ativo' }).eq('id', id).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbBloquearUsuario(id) {
    try {
        const { data, error } = await sb.from('profiles').update({ status: 'bloqueado' }).eq('id', id).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// EMPRESAS E CONVITES (OPÇÃO A — D-TUTOR-11)
// ============================================================

/** Empresas visíveis ao ADMIN (RLS) para o cadastro de convites. */
export async function sbListarEmpresas() {
    try {
        const { data, error } = await sb.from('empresas')
            .select('id, nome, ativo, criado_em')
            .order('nome', { ascending: true })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

/** Somente ADMIN: grava a empresa no catálogo mínimo. */
export async function sbCriarEmpresa(nome) {
    try {
        const { data, error } = await sb.from('empresas')
            .insert({ nome: String(nome || '').trim() })
            .select('id, nome, ativo')
            .single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

/**
 * Convida um usuário. A Edge Function valida o JWT do ADMIN e injeta
 * app_metadata.empresa_id no createUser — o navegador nunca envia o claim.
 */
export async function sbConvidarUsuarioEmpresa({ email, nome, empresaId, role }) {
    try {
        const { data, error } = await sb.functions.invoke('admin-convidar-usuario', {
            body: { email, nome, empresa_id: empresaId, role }
        })
        if (error) throw error
        if (data?.error) throw new Error(data.error.message || 'Falha ao enviar o convite')
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// VIDEOAULAS
// ============================================================
function colunaPublicoAusente(error) {
    const msg = String(error?.message || '').toLowerCase()
    return msg.includes('publico') && (msg.includes('does not exist') || msg.includes('column'))
}

export async function sbGetVideoaulas(nrId = null, publico = true) {
    const montarQuery = (filtrarPublico) => {
        let query = sb.from('videoaulas').select('*')
        if (nrId) query = query.eq('nr_id', nrId)
        if (filtrarPublico) query = query.eq('publico', publico)
        return query.order('ordem', { ascending: true })
    }

    try {
        let { data, error } = await montarQuery(publico !== null)

        // Compatibilidade durante o deploy: a coluna publico é criada
        // pela migration de direcionamento. Sem ela, mantém o comportamento antigo.
        if (error && publico !== null && colunaPublicoAusente(error)) {
            const fallback = await montarQuery(false)
            data = fallback.data
            error = fallback.error
        }

        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbCriarVideoaula(videoaula) {
    try {
        const { data, error } = await sb.from('videoaulas').insert(videoaula).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// MATERIAIS
// ============================================================
let publicoMateriaisIndisponivel = false

export async function sbGetMateriais(nrId = null, publico = true) {
    const montarQuery = ({ filtrarPublico = false, comPerfil = true } = {}) => {
        const campos = comPerfil ? '*, profiles(nome_completo)' : '*'
        let query = sb.from('materiais').select(campos)
        if (nrId) query = query.eq('nr_id', nrId)
        if (filtrarPublico) query = query.eq('publico', publico)
        return query.order('criado_em', { ascending: false })
    }

    const executar = async (opcoes) => {
        const { data, error } = await montarQuery(opcoes)
        return { data, error }
    }

    try {
        let filtrarPublico = publico !== null && !publicoMateriaisIndisponivel
        let { data, error } = await executar({ filtrarPublico })

        // Compatibilidade durante o deploy da migration de direcionamento.
        if (error && filtrarPublico && colunaPublicoAusente(error)) {
            publicoMateriaisIndisponivel = true
            filtrarPublico = false
            ;({ data, error } = await executar({ filtrarPublico }))
        }

        // A listagem não usa o embed de profiles; se o relacionamento falhar
        // (RLS/cache do PostgREST), busca apenas os materiais.
        if (error) {
            ;({ data, error } = await executar({ filtrarPublico, comPerfil: false }))
        }

        if (error) throw error
        return { data: data || [], error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbCriarMaterial(material) {
    try {
        const { data, error } = await sb.from('materiais').insert(material).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// TURMAS / TRILHAS
// ============================================================
export async function sbGetTurmas() {
    try {
        const { data, error } = await sb.from('turmas')
            .select('*')
            .order('criado_em', { ascending: false })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbCriarTurma(turma) {
    try {
        const { data, error } = await sb.from('turmas')
            .insert({
                nome: turma.nome,
                descricao: turma.descricao || '',
                tipo: turma.tipo,
                criado_por: turma.criado_por
            })
            .select()
            .single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbExcluirTurma(id) {
    try {
        // RPC atômica: remove alunos, conteúdos, provas e a turma numa só transação.
        const { error } = await sb.rpc('excluir_turma_completo', { p_turma_id: id })
        if (error) throw error
        return { error: null }
    } catch (error) {
        return { error }
    }
}

// ============================================================
// EXCLUSÕES ATÔMICAS (RPCs)
// ============================================================

export async function sbExcluirTrabalho(id) {
    try {
        const { error } = await sb.rpc('excluir_trabalho_completo', { p_trabalho_id: id })
        if (error) throw error
        return { error: null }
    } catch (error) {
        return { error }
    }
}

export async function sbExcluirCurso(nrId) {
    try {
        const { error } = await sb.rpc('excluir_curso_completo', { p_nr_id: nrId })
        if (error) throw error
        return { error: null }
    } catch (error) {
        return { error }
    }
}

export async function sbExcluirMaterial(id) {
    try {
        const { error } = await sb.rpc('excluir_material_completo', { p_material_id: id })
        if (error) throw error
        return { error: null }
    } catch (error) {
        return { error }
    }
}

export async function sbExcluirNota(id) {
    try {
        const { error } = await sb.rpc('excluir_nota_completo', { p_nota_id: id })
        if (error) throw error
        return { error: null }
    } catch (error) {
        return { error }
    }
}

export async function sbApagarTudo() {
    try {
        const { error } = await sb.rpc('sulsafe_apagar_tudo')
        if (error) throw error
        return { error: null }
    } catch (error) {
        return { error }
    }
}

export async function sbGetTurmaAlunos(turmaId = null) {
    try {
        let query = sb.from('turma_alunos').select('*')
        if (turmaId) query = query.eq('turma_id', turmaId)
        const { data, error } = await query.order('data_entrada', { ascending: true })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbAdicionarAlunoTurma(turmaId, alunoId) {
    try {
        const { data, error } = await sb.from('turma_alunos')
            .insert({ turma_id: turmaId, aluno_id: alunoId })
            .select()
            .single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbRemoverAlunoTurma(turmaId, alunoId) {
    try {
        const { error } = await sb.from('turma_alunos')
            .delete()
            .eq('turma_id', turmaId)
            .eq('aluno_id', alunoId)
        if (error) throw error
        return { error: null }
    } catch (error) {
        return { error }
    }
}

export async function sbGetTurmaMateriais(turmaId = null) {
    try {
        let query = sb.from('turma_materiais').select('*')
        if (turmaId) query = query.eq('turma_id', turmaId)
        const { data, error } = await query.order('data_vinculo', { ascending: true })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbVincularConteudoTurma(turmaId, tipo, conteudoId, professorId) {
    try {
        const dados = {
            turma_id: turmaId,
            professor_id: professorId,
            material_id: tipo === 'material' ? conteudoId : null,
            videoaula_id: tipo === 'videoaula' ? conteudoId : null
        }
        const { data, error } = await sb.from('turma_materiais')
            .insert(dados)
            .select()
            .single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbDesvincularConteudoTurma(turmaId, tipo, conteudoId) {
    try {
        let query = sb.from('turma_materiais').delete().eq('turma_id', turmaId)
        query = tipo === 'material'
            ? query.eq('material_id', conteudoId)
            : query.eq('videoaula_id', conteudoId)
        const { error } = await query
        if (error) throw error
        return { error: null }
    } catch (error) {
        return { error }
    }
}

export async function sbGetMinhasTurmas(userId) {
    try {
        const { data, error } = await sb.from('turma_alunos')
            .select('turma_id, data_entrada, turmas(*)')
            .eq('aluno_id', userId)
            .order('data_entrada', { ascending: false })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetConteudosMinhasTurmas(turmaIds) {
    try {
        if (!Array.isArray(turmaIds) || turmaIds.length === 0) {
            return { data: [], error: null }
        }
        const { data, error } = await sb.from('turma_materiais')
            .select('turma_id, material_id, videoaula_id, materiais(*), videoaulas(*)')
            .in('turma_id', turmaIds)
            .order('data_vinculo', { ascending: true })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// PROVAS / TESTES DIRECIONADOS
// ============================================================
export async function sbCriarProvaDirecionada(prova) {
    try {
        const { data, error } = await sb.from('provas_direcionadas')
            .insert({
                titulo: prova.titulo,
                descricao: prova.descricao || '',
                nr_id: prova.nr_id || null,
                tipo: prova.tipo || 'prova',
                turma_id: prova.turma_id || null,
                aluno_id: prova.aluno_id || null,
                arquivo_url: prova.arquivo_url || null,
                prazo: prova.prazo || null,
                publicado: prova.publicado !== false,
                criado_por: prova.criado_por
            })
            .select()
            .single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetProvasDirecionadasProfessor() {
    try {
        const { data, error } = await sb.from('provas_direcionadas')
            .select('*')
            .order('criado_em', { ascending: false })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetProvasDirecionadasAluno() {
    try {
        const { data, error } = await sb.from('provas_direcionadas')
            .select('*, turmas(nome, tipo)')
            .eq('publicado', true)
            .order('criado_em', { ascending: false })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbExcluirProvaDirecionada(id) {
    try {
        const { error } = await sb.from('provas_direcionadas').delete().eq('id', id)
        if (error) throw error
        return { error: null }
    } catch (error) {
        return { error }
    }
}

// ============================================================
// UPLOAD ARQUIVOS (STORAGE)
// ============================================================
export async function sbUploadArquivo(bucket, path, file) {
    try {
        const { data, error } = await sb.storage.from(bucket).upload(path, file, {
            cacheControl: '3600',
            upsert: false
        })
        if (error) throw error
        const { data: urlData } = sb.storage.from(bucket).getPublicUrl(path)
        return { data: { ...data, publicUrl: urlData.publicUrl }, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// DOSSIÊ SISTEC / DOCUMENTOS DO ALUNO
// ============================================================
function extensaoDocumento(file) {
    const porMime = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'application/pdf': 'pdf'
    }

    if (porMime[file?.type]) return porMime[file.type]

    const extensao = String(file?.name || '').split('.').pop()?.toLowerCase()
    return /^[a-z0-9]{2,5}$/.test(extensao || '') ? extensao : 'bin'
}

export async function sbGetMeuDossie() {
    const id = uid()
    if (!id) return { data: null, error: new Error('Sessão inválida.') }

    return sbGetUser(id)
}

export async function sbGetAlunosDossie() {
    try {
        const { data, error } = await sb.from('profiles')
            .select('*')
            .eq('role', 'aluno')
            .order('nome_completo')
            .limit(1000)

        if (error) throw error
        return { data: data || [], error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbSalvarMeuDossie(dados) {
    try {
        const { data, error } = await sb.rpc('atualizar_meu_dossie', {
            p_nome_completo: dados.nome_completo,
            p_cpf: dados.cpf,
            p_data_nascimento: dados.data_nascimento,
            p_cor_raca: dados.cor_raca,
            p_renda_per_capita: dados.renda_per_capita,
            p_identidade_genero: dados.identidade_genero,
            p_tipo_deficiencia: dados.tipo_deficiencia,
            p_forma_acesso: dados.forma_acesso,
            p_nome_mae: dados.nome_mae || null,
            p_nacionalidade: dados.nacionalidade || 'Brasileira',
            p_sexo: dados.sexo || null
        }).single()

        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbAdminSalvarDossie(alunoId, dados) {
    try {
        if (!alunoId) throw new Error('Aluno não informado.')

        const { data, error } = await sb.from('profiles')
            .update({
                nome_completo: dados.nome_completo,
                cpf: dados.cpf,
                data_nascimento: dados.data_nascimento,
                cor_raca: dados.cor_raca,
                renda_per_capita: dados.renda_per_capita,
                identidade_genero: dados.identidade_genero,
                tipo_deficiencia: dados.tipo_deficiencia,
                forma_acesso: dados.forma_acesso,
                nome_mae: dados.nome_mae || null,
                nacionalidade: dados.nacionalidade || 'Brasileira',
                sexo: dados.sexo || null,
                dossie_status: 'pendente',
                dossie_observacoes: null,
                dossie_aprovado_em: null,
                dossie_aprovado_por: null
            })
            .eq('id', alunoId)
            .eq('role', 'aluno')
            .select()
            .single()

        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbDefinirFotoPerfil(path) {
    try {
        const { data, error } = await sb.rpc('definir_foto_perfil', {
            p_path: path
        }).single()

        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbAdminDefinirFotoAluno(alunoId, path) {
    try {
        if (!alunoId) throw new Error('Aluno não informado.')

        const { data, error } = await sb.from('profiles')
            .update({
                foto_url: path,
                dossie_status: 'pendente',
                dossie_observacoes: null,
                dossie_aprovado_em: null,
                dossie_aprovado_por: null
            })
            .eq('id', alunoId)
            .eq('role', 'aluno')
            .select()
            .single()

        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbAdminMarcarDossiePendente(alunoId) {
    try {
        if (!alunoId) throw new Error('Aluno não informado.')

        const { data, error } = await sb.from('profiles')
            .update({
                dossie_status: 'pendente',
                dossie_observacoes: null,
                dossie_aprovado_em: null,
                dossie_aprovado_por: null
            })
            .eq('id', alunoId)
            .eq('role', 'aluno')
            .select()
            .single()

        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetDocumentosAluno(alunoId) {
    try {
        if (!alunoId) throw new Error('Aluno não informado.')

        const { data, error } = await sb.from('documentos_aluno')
            .select('*')
            .eq('aluno_id', alunoId)
            .order('tipo_documento')

        if (error) throw error
        return { data: data || [], error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbUploadDocumentoAluno({
    alunoId,
    tipoDocumento,
    file,
    arquivoAnterior = null
}) {
    try {
        if (!alunoId) throw new Error('Aluno não informado.')
        if (!tipoDocumento) throw new Error('Tipo de documento não informado.')
        if (!file) throw new Error('Selecione um arquivo.')

        if (file.size > LIMITE_DOCUMENTO_BYTES) {
            throw new Error('O arquivo deve ter no máximo 10 MB.')
        }

        const extensao = extensaoDocumento(file)
        const path = `${alunoId}/${tipoDocumento}-${Date.now()}.${extensao}`

        const { error: uploadError } = await sb.storage
            .from(DOCUMENTOS_BUCKET)
            .upload(path, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type || undefined
            })

        if (uploadError) throw uploadError

        const { data, error: dbError } = await sb.from('documentos_aluno')
            .upsert({
                aluno_id: alunoId,
                tipo_documento: tipoDocumento,
                arquivo_url: path,
                arquivo_path: path,
                nome_arquivo: file.name,
                mime_type: file.type || null,
                tamanho_bytes: file.size,
                status: 'pendente',
                observacao: null,
                enviado_em: new Date().toISOString(),
                analisado_em: null,
                analisado_por: null
            }, { onConflict: 'aluno_id,tipo_documento' })
            .select()
            .single()

        if (dbError) {
            await sb.storage.from(DOCUMENTOS_BUCKET).remove([path])
            throw dbError
        }

        if (arquivoAnterior && arquivoAnterior !== path) {
            await sb.storage.from(DOCUMENTOS_BUCKET).remove([arquivoAnterior])
        }

        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbCriarUrlDocumento(path, expiresIn = 3600) {
    try {
        if (!path) throw new Error('Arquivo não informado.')

        if (/^https?:\/\//i.test(path)) {
            return { data: { signedUrl: path }, error: null }
        }

        const { data, error } = await sb.storage
            .from(DOCUMENTOS_BUCKET)
            .createSignedUrl(path, expiresIn)

        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbAtualizarStatusDocumento(id, status, observacao = null) {
    try {
        if (!id) throw new Error('Documento não informado.')

        const { data, error } = await sb.from('documentos_aluno')
            .update({
                status,
                observacao: observacao || null
            })
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbExcluirDocumentoAluno(documento) {
    try {
        if (!documento?.id) throw new Error('Documento não informado.')

        const { error } = await sb.from('documentos_aluno')
            .delete()
            .eq('id', documento.id)

        if (error) throw error

        if (documento.arquivo_path) {
            await sb.storage.from(DOCUMENTOS_BUCKET).remove([documento.arquivo_path])
        }

        return { error: null }
    } catch (error) {
        return { error }
    }
}

export async function sbAuditarDossie(alunoId, status, observacoes = null) {
    try {
        const { data, error } = await sb.rpc('auditar_dossie', {
            p_aluno_id: alunoId,
            p_status: status,
            p_observacoes: observacoes
        }).single()

        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// PROGRESSO
// ============================================================
export async function sbSalvarProgresso(userId, aulaId, segundos, concluido = false) {
    try {
        const { data, error } = await sb.from('progresso_aulas').upsert({
            user_id: userId,
            aula_id: aulaId,
            assistiu_segundos: segundos,
            concluído: concluido,
            ultima_atualizacao: new Date().toISOString()
        }).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetProgressoUsuario(userId) {
    try {
        const { data, error } = await sb.from('progresso_aulas')
            .select('*, videoaulas(*)')
            .eq('user_id', userId)
            .order('ultima_atualizacao', { ascending: false })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// NOTAS
// ============================================================
export async function sbGetNotasAluno(userId) {
    try {
        const { data, error } = await sb.from('notas')
            .select('*')
            .eq('usuario_id', userId)
            .order('criado_em', { ascending: false })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbLancarNota(userId, nrId, nota, obs = '', professorId = null) {
    try {
        const { data, error } = await sb.from('notas').insert({
            usuario_id: userId,
            nr_id: nrId,
            nota,
            obs: sanitizar(obs),
            professor_id: professorId
        }).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetMediasNRs() {
    try {
        const { data, error } = await sb.from('view_medias_nrs').select('*').order('nr_id')
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// CERTIFICADOS
// ============================================================
export async function sbEmitirCertificado(userId, nrId, nota, cargaHoraria = 40) {
    try {
        const codigo = 'SS-' + Math.random().toString(36).substr(2, 8).toUpperCase()
        const { data, error } = await sb.from('certificados').insert({
            usuario_id: userId,
            nr_id: nrId,
            codigo,
            nota,
            carga_horaria: cargaHoraria,
            emitido_por: uid()
        }).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetCertificadosAluno(userId) {
    try {
        const { data, error } = await sb.from('certificados')
            .select('*')
            .eq('usuario_id', userId)
            .order('criado_em', { ascending: false })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// PROVAS
// ============================================================
export async function sbEnviarProva(userId, nrId, titulo, arquivoUrl) {
    try {
        const { data, error } = await sb.from('provas').insert({
            usuario_id: userId,
            nr_id: nrId,
            titulo: sanitizar(titulo),
            arquivo_url: arquivoUrl,
            status: 'pendente'
        }).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetProvasPendentes() {
    try {
        const { data, error } = await sb.rpc('sulsafe_listar_provas_pendentes')

        if (!error) {
            const provas = (data || []).map(prova => ({
                ...prova,
                profiles: {
                    nome_completo: prova.aluno_nome,
                    email: prova.aluno_email
                }
            }))
            return { data: provas, error: null }
        }

        // Compatibilidade durante o deploy da migration de segurança.
        const fallback = await sb.from('provas')
            .select('*, profiles(nome_completo, email)')
            .eq('status', 'pendente')
            .order('criado_em', { ascending: true })

        if (fallback.error) throw fallback.error
        return { data: fallback.data || [], error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// FASE 5 (ETAPA 4) — REVISÃO HITL DE PROVAS GERADAS PELO TUTOR
// ============================================================
// A fila continua em sbGetProvasPendentes()? NÃO: aquela é a tabela legada
// `provas` (entregas de alunos). A fila da I.A. é consumida pela rota
// /api/tutor/provas-pendentes. Aqui só ficam leitura da revisão, edição e
// decisão. O gabarito vem de uma RPC restrita a admin/professor.
// ============================================================

async function tokenSessao() {
    const { data } = await sb.auth.getSession()
    return data?.session?.access_token || null
}

export async function sbGetRevisaoProvaFilaIA() {
    try {
        const token = await tokenSessao()
        if (!token) throw new Error('Sessão expirada. Faça login novamente.')

        const resposta = await fetch('/api/tutor/provas-pendentes', {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store'
        })
        const corpo = await resposta.json().catch(() => ({}))
        if (!resposta.ok) throw new Error(corpo?.error?.message || 'Não foi possível carregar a fila de provas.')
        return { data: Array.isArray(corpo.provas) ? corpo.provas : [], error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbObterRevisaoProvaIA(provaId) {
    try {
        if (!provaId) throw new Error('Prova não informada.')
        const { data, error } = await sb.rpc('sulsafe_obter_revisao_prova_ia', { p_prova_id: provaId })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbEditarQuestaoProvaIA({ questaoId, enunciado, alternativas, gabarito }) {
    try {
        if (!questaoId) throw new Error('Questão não informada.')
        const { data, error } = await sb.rpc('sulsafe_editar_questao_prova_ia', {
            p_questao_id: questaoId,
            p_enunciado: enunciado,
            p_alternativas: alternativas,
            p_gabarito: gabarito
        })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

async function decidirProvaIA(rota, provaId, motivo) {
    try {
        const token = await tokenSessao()
        if (!token) throw new Error('Sessão expirada. Faça login novamente.')

        const resposta = await fetch(`/api/tutor/provas/${encodeURIComponent(provaId)}/${rota}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ motivo: motivo ?? null }),
            cache: 'no-store'
        })
        const corpo = await resposta.json().catch(() => ({}))
        if (!resposta.ok) throw new Error(corpo?.error?.message || 'Não foi possível registrar a decisão.')
        return { data: corpo, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbAprovarProvaIA(provaId) {
    return decidirProvaIA('aprovar', provaId, null)
}

export async function sbRejeitarProvaIA(provaId, motivo) {
    return decidirProvaIA('rejeitar', provaId, motivo)
}

// ------------------------------------------------------------
// FASE 5 (ETAPA 5) — DISTRIBUIÇÃO DIRECIONADA
// ------------------------------------------------------------
// Listagens passam pela RPC com o JWT da sessão atual. A distribuição passa
// pela rota /api/tutor/provas/:id/distribuir para manter o mesmo padrão da
// aprovação (JWT do chamador + chave anônima no servidor, sem chave de serviço).
// ------------------------------------------------------------

export async function sbListarProvasAprovadasIA() {
    try {
        const { data, error } = await sb.rpc('sulsafe_listar_provas_aprovadas_ia')
        if (error) throw error
        return { data: Array.isArray(data) ? data : [], error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbListarDestinosDistribuicaoIA() {
    try {
        const { data, error } = await sb.rpc('sulsafe_listar_destinos_distribuicao_ia')
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbDistribuirProvaIA({ provaId, destinoTipo, destinoId = null }) {
    try {
        if (!provaId) throw new Error('Prova não informada.')

        const token = await tokenSessao()
        if (!token) throw new Error('Sessão expirada. Faça login novamente.')

        const resposta = await fetch(`/api/tutor/provas/${encodeURIComponent(provaId)}/distribuir`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ destino_tipo: destinoTipo, destino_id: destinoId }),
            cache: 'no-store'
        })
        const corpo = await resposta.json().catch(() => ({}))
        if (!resposta.ok) throw new Error(corpo?.error?.message || 'Não foi possível distribuir a prova.')
        return { data: corpo, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ------------------------------------------------------------
// FASE 5 (ETAPA 6) — REALIZAÇÃO E CORREÇÃO AUTOMÁTICA
// ------------------------------------------------------------
// Leitura via RPC (JWT do aluno). A submissão vai pela rota
// /api/aluno/provas/:id/submeter, mantendo anon key no servidor.
// Nenhum helpers desta etapa solicita gabarito ou justificativa.
// ------------------------------------------------------------

export async function sbListarProvasDistribuidasAluno() {
    try {
        const { data, error } = await sb.rpc('sulsafe_listar_provas_aluno_ia')
        if (error) throw error
        return { data: Array.isArray(data) ? data : [], error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbCarregarCabecalhoProvaAlunoIA(provaId) {
    try {
        if (!provaId) throw new Error('Prova não informada.')
        const { data, error } = await sb.rpc('sulsafe_carregar_cabecalho_prova_aluno_ia', { p_prova_id: provaId })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbCarregarQuestoesProvaAlunoIA(provaId) {
    try {
        if (!provaId) throw new Error('Prova não informada.')
        const { data, error } = await sb.rpc('sulsafe_carregar_prova_aluno_ia', { p_prova_id: provaId })
        if (error) throw error
        return { data: Array.isArray(data) ? data : [], error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbSubmeterProvaAlunoIA(provaId, respostas) {
    try {
        if (!provaId) throw new Error('Prova não informada.')
        if (!Array.isArray(respostas) || respostas.length === 0) throw new Error('Responda todas as questões.')

        const token = await tokenSessao()
        if (!token) throw new Error('Sessão expirada. Faça login novamente.')

        const resposta = await fetch(`/api/aluno/provas/${encodeURIComponent(provaId)}/submeter`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ respostas }),
            cache: 'no-store'
        })
        const corpo = await resposta.json().catch(() => ({}))
        if (!resposta.ok) throw new Error(corpo?.error?.message || 'Não foi possível finalizar a prova.')
        return { data: corpo, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ------------------------------------------------------------
// FASE 5 (ETAPA 7) — PAINEL DE RESULTADOS DO PROFESSOR
// ------------------------------------------------------------
// Listagem, detalhe e correção passam pelas rotas do Tutor com o JWT da
// sessão. O detalhe é a única forma de o professor receber o gabarito.
// ------------------------------------------------------------

export async function sbListarResultadosProvaIA(provaId) {
    try {
        if (!provaId) throw new Error('Prova não informada.')

        const token = await tokenSessao()
        if (!token) throw new Error('Sessão expirada. Faça login novamente.')

        const resposta = await fetch(`/api/tutor/provas/${encodeURIComponent(provaId)}/resultados`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store'
        })
        const corpo = await resposta.json().catch(() => ({}))
        if (!resposta.ok) throw new Error(corpo?.error?.message || 'Não foi possível carregar os resultados.')
        return { data: Array.isArray(corpo.resultados) ? corpo.resultados : [], error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbCarregarDetalheResultadoIA(provaId, alunoId) {
    try {
        if (!provaId || !alunoId) throw new Error('Prova ou aluno não informado.')

        const token = await tokenSessao()
        if (!token) throw new Error('Sessão expirada. Faça login novamente.')

        const resposta = await fetch(
            `/api/tutor/provas/${encodeURIComponent(provaId)}/resultados/${encodeURIComponent(alunoId)}`,
            { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
        )
        const corpo = await resposta.json().catch(() => ({}))
        if (!resposta.ok) throw new Error(corpo?.error?.message || 'Não foi possível carregar o detalhe.')
        return { data: corpo.detalhe || null, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbCorrigirRespostaDiscursivaIA({ provaId, alunoId, questaoId, nota } = {}) {
    try {
        if (!provaId || !alunoId || !questaoId) throw new Error('Prova, aluno ou questão não informado.')

        const token = await tokenSessao()
        if (!token) throw new Error('Sessão expirada. Faça login novamente.')

        const resposta = await fetch(
            `/api/tutor/provas/${encodeURIComponent(provaId)}/resultados/${encodeURIComponent(alunoId)}/corrigir`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ questao_id: questaoId, nota }),
                cache: 'no-store'
            }
        )
        const corpo = await resposta.json().catch(() => ({}))
        if (!resposta.ok) throw new Error(corpo?.error?.message || 'Não foi possível registrar a correção.')
        return { data: corpo, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ------------------------------------------------------------
// FASE 5.3 — GATE HITL E PROGRESSO DOS ALUNOS
// ------------------------------------------------------------
// A nota da I.A. continua calculada no banco; estas RPCs são o único caminho
// para ajustar/liberar e para o professor consultar o progresso da empresa.
// ------------------------------------------------------------

export async function sbLiberarNotaIA({ provaId, alunoId, nota } = {}) {
    try {
        if (!provaId || !alunoId) throw new Error('Prova ou aluno não informado.')
        const notaFinal = nota === null || nota === undefined || nota === ''
            ? null
            : Number(nota)
        if (notaFinal !== null && (!Number.isFinite(notaFinal) || notaFinal < 0 || notaFinal > 10)) {
            throw new Error('Informe uma nota entre 0 e 10.')
        }

        const { data, error } = await sb.rpc('sulsafe_revisar_liberar_nota_ia', {
            p_prova_id: provaId,
            p_aluno_id: alunoId,
            p_nota: notaFinal
        })
        if (error) throw error
        return { data: Boolean(data), error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbListarProgressoAlunos(turmaId = null, alunoId = null) {
    try {
        const { data, error } = await sb.rpc('sulsafe_listar_progresso_alunos', {
            p_turma_id: turmaId || null,
            p_aluno_id: alunoId || null
        })
        if (error) throw error
        return { data: Array.isArray(data) ? data : [], error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbNotaAlunoIA(provaId) {
    try {
        if (!provaId) throw new Error('Prova não informada.')
        const { data, error } = await sb.rpc('sulsafe_nota_aluno_ia', { p_prova_id: provaId })
        if (error) throw error
        return { data: data === null ? null : Number(data), error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetProvasAluno(userId) {
    try {
        const { data, error } = await sb.from('provas')
            .select('*')
            .eq('usuario_id', userId)
            .order('criado_em', { ascending: false })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbCorrigirProva(provaId, nota, status = 'corrigido') {
    try {
        const { data, error } = await sb.from('provas')
            .update({ nota, status, corrigido_em: new Date().toISOString() })
            .eq('id', provaId)
            .select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// SALAS
// ============================================================
export async function sbCriarSala(topico, meetId, criadoPor) {
    try {
        const { data, error } = await sb.from('salas').insert({
            topico: sanitizar(topico),
            meet_id: sanitizar(meetId),
            criado_por: criadoPor,
            ativa: true
        }).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetSalasAtivas() {
    try {
        const { data, error } = await sb.rpc('sulsafe_listar_salas_ativas')

        if (!error) {
            const salas = (data || []).map(sala => ({
                ...sala,
                profiles: { nome_completo: sala.criador_nome }
            }))
            return { data: salas, error: null }
        }

        // Compatibilidade durante o deploy da migration de segurança.
        const fallback = await sb.from('salas')
            .select('*, profiles(nome_completo)')
            .eq('ativa', true)
            .order('created_at', { ascending: false })

        if (fallback.error) throw fallback.error
        return { data: fallback.data || [], error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// NOTIFICAÇÕES
// ============================================================
export async function sbCriarNotificacao(userId, titulo, mensagem, link = null) {
    try {
        const { data, error } = await sb.from('notificacoes').insert({
            usuario_id: userId,
            titulo: sanitizar(titulo),
            mensagem: sanitizar(mensagem),
            link,
            lida: false
        }).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetNotificacoes(userId, limit = 10) {
    try {
        const { data, error } = await sb.from('notificacoes')
            .select('*')
            .eq('usuario_id', userId)
            .order('criado_em', { ascending: false })
            .limit(limit)
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbMarcarNotificacaoLida(notificacaoId) {
    try {
        const { data, error } = await sb.from('notificacoes')
            .update({ lida: true })
            .eq('id', notificacaoId)
            .select()
            .single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbMarcarTodasNotificacoesLidas(userId) {
    try {
        const { data, error } = await sb.from('notificacoes')
            .update({ lida: true })
            .eq('usuario_id', userId)
            .eq('lida', false)
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// FÓRUM DE DÚVIDAS (COMUNIDADE)
// ============================================================
export async function sbGetMensagensForum(nrId = null) {
    try {
        const { data, error } = await sb.rpc('sulsafe_listar_mensagens_forum', {
            p_nr_id: nrId ? Number(nrId) : null
        })

        if (!error) {
            const mensagens = (data || []).map(mensagem => ({
                ...mensagem,
                profiles: {
                    nome_completo: mensagem.autor_nome,
                    role: mensagem.autor_role
                }
            }))
            return { data: mensagens, error: null }
        }

        // Compatibilidade durante o deploy da migration de segurança.
        let query = sb.from('mensagens_forum')
            .select('*, profiles(nome_completo, role)')
            .order('criado_em', { ascending: false })
        if (nrId) {
            query = query.eq('nr_id', Number(nrId))
        }
        const fallback = await query
        if (fallback.error) throw fallback.error
        return { data: fallback.data || [], error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbCriarMensagemForum(topico, mensagem, nrId, userId) {
    try {
        const { data, error } = await sb.from('mensagens_forum').insert({
            usuario_id: userId,
            topico: sanitizar(topico),
            mensagem: sanitizar(mensagem),
            nr_id: nrId ? Number(nrId) : null,
            status: 'aberta'
        }).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// DASHBOARD
// ============================================================
export async function sbGetDashboardMetrics() {
    try {
        const { data, error } = await sb.from('view_dashboard_admin').select('*').single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetRankingAlunos() {
    try {
        const { data, error } = await sb.from('view_ranking_alunos').select('*')
        if (error) throw error
        return { data: error ? null : data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// TUTOR-SULSAFE (PROFESSOR I.A — IA 2)
// ============================================================
// A chave de API nunca passa por aqui: ela fica no Vault e é lida somente
// pela Edge Function. O navegador conversa apenas com RPCs autorizadas.

/**
 * Cria um job de geração. `prompt` deve ser montado por montarPromptTutor().
 * @returns { data: string (job_id), error }
 */
export async function sbCriarJobTutor({ titulo, prompt, tipo, provedor = null, quantidadeQuestoes = null }) {
    try {
        const argumentos = {
            p_titulo: titulo,
            p_prompt: prompt,
            p_tipo: tipo,
            p_provedor: provedor
        }
        // Tipos legados seguem chamando a assinatura antiga; somente PROVA
        // envia o novo parâmetro (aplicável após a migration da Etapa 3.1).
        if (quantidadeQuestoes !== null && quantidadeQuestoes !== undefined) {
            argumentos.p_quantidade_questoes = quantidadeQuestoes
        }
        const { data, error } = await sb.rpc('sulsafe_criar_ia_job', argumentos)
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

/** Extrai a mensagem em pt-BR devolvida pela Edge Function, quando houver. */
async function erroAmigavelFunction(error) {
    const contexto = error?.context
    if (contexto && typeof contexto.json === 'function') {
        try {
            const resposta = typeof contexto.clone === 'function' ? contexto.clone() : contexto
            const corpo = await resposta.json()
            const mensagem = corpo?.error?.message || corpo?.message
            if (mensagem) {
                const amigavel = new Error(String(mensagem))
                amigavel.codigo = corpo?.error?.code || null
                amigavel.status = contexto.status
                return amigavel
            }
        } catch (_) {
            // Mantém o erro original se o corpo não for JSON.
        }
    }
    return error
}

/** Dispara a Edge Function. O worker atualiza o job e grava o rascunho. */
export async function sbGerarComTutor(jobId) {
    try {
        const { data, error } = await sb.functions.invoke('tutor-sulsafe', {
            body: { job_id: jobId }
        })
        if (error) throw await erroAmigavelFunction(error)
        if (data?.error) throw new Error(data.error.message || 'Falha na geração')
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

/** Flag leve: o Professor I.A. está configurado e ativo? */
export async function sbTutorHabilitado() {
    try {
        const { data, error } = await sb.rpc('sulsafe_tutor_habilitado')
        if (error) throw error
        return { data: Boolean(data), error: null }
    } catch (error) {
        return { data: false, error }
    }
}

/** Lista rascunhos para revisão (ADMIN/PROFESSOR). */
export async function sbListarRascunhosTutor(jobId = null) {
    try {
        const { data, error } = await sb.rpc('sulsafe_listar_rascunhos_tutor', {
            p_job_id: jobId
        })
        if (error) throw error
        return { data: data || [], error: null }
    } catch (error) {
        return { data: [], error }
    }
}

/** Aprova, rejeita ou publica um rascunho (decisão humana). */
export async function sbRevisarRascunhoTutor(conteudoId, decisao, observacao = null) {
    try {
        const { error } = await sb.rpc('sulsafe_revisar_ia_conteudo', {
            p_id: conteudoId,
            p_decisao: decisao,
            p_observacao: observacao
        })
        if (error) throw error
        return { data: true, error: null }
    } catch (error) {
        return { data: false, error }
    }
}

/** Materializa o rascunho aprovado em videoaula/material com nr_id. */
export async function sbMaterializarRascunhoTutor({
    conteudoId, nrId, destino, titulo = null, descricao = null, url = null
}) {
    try {
        const { data, error } = await sb.rpc('sulsafe_materializar_rascunho_tutor', {
            p_conteudo_id: conteudoId,
            p_nr_id: nrId,
            p_destino: destino,
            p_titulo: titulo,
            p_descricao: descricao,
            p_url: url
        })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

/** Vincula o conteúdo materializado a turmas, trilhas ou atendimentos individuais. */
export async function sbDirecionarConteudoTutor(conteudoId, turmaIds) {
    try {
        const { data, error } = await sb.rpc('sulsafe_direcionar_conteudo_tutor', {
            p_conteudo_id: conteudoId,
            p_turma_ids: turmaIds
        })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

/** Libera o conteúdo materializado para o catálogo da NR (decisão humana). */
export async function sbPublicarConteudoTutor(conteudoId, publico = true) {
    try {
        const { data, error } = await sb.rpc('sulsafe_publicar_conteudo_tutor', {
            p_conteudo_id: conteudoId,
            p_publico: publico
        })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// FASE 5.2 — PALESTRAS (CRIACAO, APROVACAO E DISTRIBUICAO)
// ============================================================
// Toda escrita passa por RPC com validacao de empresa no banco.
// Nenhum segredo de servico e usado no navegador.
// ------------------------------------------------------------

export async function sbCriarPalestraManual({ titulo, descricao, publicoAlvo, duracaoMin, roteiro } = {}) {
    try {
        const { data, error } = await sb.rpc('sulsafe_criar_palestra', {
            p_titulo: titulo,
            p_descricao: descricao || null,
            p_publico_alvo: publicoAlvo || null,
            p_duracao_min: duracaoMin ?? null,
            p_roteiro: JSON.stringify(Array.isArray(roteiro) ? roteiro : [])
        })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbCriarPalestraIA(conteudoId) {
    try {
        if (!conteudoId) throw new Error('Rascunho da I.A. nao informado.')
        const { data, error } = await sb.rpc('sulsafe_criar_palestra_ia', { p_conteudo_id: conteudoId })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbAprovarPalestra(palestraId) {
    try {
        if (!palestraId) throw new Error('Palestra nao informada.')
        const { data, error } = await sb.rpc('sulsafe_aprovar_palestra', { p_palestra_id: palestraId })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbDistribuirPalestra({ palestraId, destinoTipo, destinoId } = {}) {
    try {
        if (!palestraId || !destinoTipo) throw new Error('Palestra e destino sao obrigatorios.')
        const { data, error } = await sb.rpc('sulsafe_distribuir_palestra', {
            p_palestra_id: palestraId,
            p_destino_tipo: destinoTipo,
            p_destino_id: destinoId || null
        })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbListarPalestrasProfessor() {
    try {
        const { data, error } = await sb.rpc('sulsafe_listar_palestras_professor')
        if (error) throw error
        return { data: Array.isArray(data) ? data : [], error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbListarPalestrasAluno() {
    try {
        const { data, error } = await sb.rpc('sulsafe_listar_palestras_aluno')
        if (error) throw error
        return { data: Array.isArray(data) ? data : [], error: null }
    } catch (error) {
        return { data: null, error }
    }
}