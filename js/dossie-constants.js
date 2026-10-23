// ============================================================
// DOSSIÊ SISTEC - CONSTANTES COMPARTILHADAS
// ============================================================

export const DOCUMENTOS_DOSSIE = [
    {
        tipo: 'FOTO_3X4',
        label: 'Foto 3x4',
        descricao: 'Foto recente, de frente, com fundo claro.',
        obrigatorio: true,
        aceita: 'image/jpeg,image/png',
        extensoes: '.jpg,.jpeg,.png'
    },
    {
        tipo: 'RG',
        label: 'RG / Documento de identidade',
        descricao: 'Documento oficial com foto e número de registro.',
        obrigatorio: true,
        aceita: 'image/jpeg,image/png,application/pdf',
        extensoes: '.jpg,.jpeg,.png,.pdf'
    },
    {
        tipo: 'CPF',
        label: 'CPF',
        descricao: 'Comprovante de inscrição ou documento com o CPF.',
        obrigatorio: true,
        aceita: 'image/jpeg,image/png,application/pdf',
        extensoes: '.jpg,.jpeg,.png,.pdf'
    },
    {
        tipo: 'HISTORICO_ESCOLAR',
        label: 'Histórico escolar',
        descricao: 'Histórico do ensino médio ou da última instituição.',
        obrigatorio: true,
        aceita: 'image/jpeg,image/png,application/pdf',
        extensoes: '.jpg,.jpeg,.png,.pdf'
    },
    {
        tipo: 'COMPROVANTE_RESIDENCIA',
        label: 'Comprovante de residência',
        descricao: 'Conta de água, luz, telefone ou declaração equivalente.',
        obrigatorio: true,
        aceita: 'image/jpeg,image/png,application/pdf',
        extensoes: '.jpg,.jpeg,.png,.pdf'
    },
    {
        tipo: 'CERTIDAO_NASCIMENTO',
        label: 'Certidão de nascimento ou casamento',
        descricao: 'Documento opcional para conferência de filiação.',
        obrigatorio: false,
        aceita: 'image/jpeg,image/png,application/pdf',
        extensoes: '.jpg,.jpeg,.png,.pdf'
    },
    {
        tipo: 'RESERVISTA',
        label: 'Certificado de reservista',
        descricao: 'Obrigatório para alunos do sexo masculino, quando aplicável.',
        obrigatorio: false,
        aceita: 'image/jpeg,image/png,application/pdf',
        extensoes: '.jpg,.jpeg,.png,.pdf'
    },
    {
        tipo: 'TITULO_ELEITOR',
        label: 'Título de eleitor',
        descricao: 'Documento opcional para complemento do cadastro.',
        obrigatorio: false,
        aceita: 'image/jpeg,image/png,application/pdf',
        extensoes: '.jpg,.jpeg,.png,.pdf'
    },
    {
        tipo: 'CNH',
        label: 'CNH',
        descricao: 'Carteira Nacional de Habilitação, quando utilizada como documento.',
        obrigatorio: false,
        aceita: 'image/jpeg,image/png,application/pdf',
        extensoes: '.jpg,.jpeg,.png,.pdf'
    },
    {
        tipo: 'OUTRO',
        label: 'Outro documento',
        descricao: 'Documento complementar solicitado pela secretaria.',
        obrigatorio: false,
        aceita: 'image/jpeg,image/png,application/pdf',
        extensoes: '.jpg,.jpeg,.png,.pdf'
    }
]

export const TIPOS_DOCUMENTO_OBRIGATORIOS = DOCUMENTOS_DOSSIE
    .filter(item => item.obrigatorio)
    .map(item => item.tipo)

export const CORES_RACA = [
    'Branca',
    'Preta',
    'Parda',
    'Amarela',
    'Indígena',
    'Prefiro não informar'
]

export const IDENTIDADES_GENERO = [
    'Mulher cisgênero',
    'Homem cisgênero',
    'Mulher transgênero',
    'Homem transgênero',
    'Travesti',
    'Não binário',
    'Outro',
    'Prefiro não informar'
]

export const TIPOS_DEFICIENCIA = [
    'Nenhuma',
    'Física',
    'Visual',
    'Auditiva',
    'Intelectual',
    'Psicossocial',
    'Múltipla',
    'Outra',
    'Prefiro não informar'
]

export const FORMAS_ACESSO = [
    'Vestibular',
    'ENEM',
    'SISU',
    'Transferência',
    'Reingresso',
    'Convênio',
    'Seleção interna',
    'Outra'
]

export const SEXOS = [
    'Feminino',
    'Masculino',
    'Intersexo',
    'Prefiro não informar'
]

export const STATUS_DOSSIE = {
    pendente: { label: 'Pendente', classe: 'bg-pendente' },
    aprovado: { label: 'Aprovado', classe: 'bg-ok' },
    rejeitado: { label: 'Rejeitado', classe: 'bg-err' }
}

export const STATUS_DOCUMENTO = {
    pendente: { label: 'Pendente', classe: 'bg-pendente' },
    aprovado: { label: 'Aprovado', classe: 'bg-ok' },
    rejeitado: { label: 'Rejeitado', classe: 'bg-err' }
}

export function somenteDigitos(valor) {
    return String(valor || '').replace(/\D/g, '')
}

export function mascararCpf(valor) {
    const digitos = somenteDigitos(valor).slice(0, 11)

    if (digitos.length <= 3) return digitos
    if (digitos.length <= 6) return `${digitos.slice(0, 3)}.${digitos.slice(3)}`
    if (digitos.length <= 9) {
        return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6)}`
    }

    return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`
}

export function validarCpf(valor) {
    const cpf = somenteDigitos(valor)

    if (cpf.length !== 11) return false
    if (/^(\d)\1{10}$/.test(cpf)) return false

    const calcularDigito = (base) => {
        let soma = 0

        for (let i = 0; i < base.length; i += 1) {
            soma += Number(base[i]) * (base.length + 1 - i)
        }

        const resto = (soma * 10) % 11
        return resto === 10 ? 0 : resto
    }

    const primeiro = calcularDigito(cpf.slice(0, 9))
    const segundo = calcularDigito(cpf.slice(0, 10))

    return cpf[9] === String(primeiro) && cpf[10] === String(segundo)
}

export function formatarDataBR(valor) {
    if (!valor) return '-'

    if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        const [ano, mes, dia] = valor.split('-')
        return `${dia}/${mes}/${ano}`
    }

    const data = valor instanceof Date ? valor : new Date(valor)
    if (Number.isNaN(data.getTime())) return String(valor)

    return data.toLocaleDateString('pt-BR')
}

export function formatarRenda(valor) {
    const numero = Number(valor)
    if (!Number.isFinite(numero)) return '-'

    return numero.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    })
}

export function labelDocumento(tipo) {
    return DOCUMENTOS_DOSSIE.find(item => item.tipo === tipo)?.label || tipo || 'Documento'
}

export function statusDossieInfo(status) {
    return STATUS_DOSSIE[status] || STATUS_DOSSIE.pendente
}

export function statusDocumentoInfo(status) {
    return STATUS_DOCUMENTO[status] || STATUS_DOCUMENTO.pendente
}

export function migrationPendente(error) {
    const mensagem = String(error?.message || '').toLowerCase()
    const codigo = String(error?.code || '')

    if (mensagem.includes('permission denied') || mensagem.includes('row-level security')) {
        return false
    }

    if (['42P01', '42703', '42883', 'PGRST202', 'PGRST205'].includes(codigo)) return true

    return (
        mensagem.includes('could not find the table') ||
        mensagem.includes('could not find the function') ||
        mensagem.includes('does not exist') ||
        mensagem.includes('schema cache')
    )
}

export function mensagemMigration() {
    return 'A migration do dossiê SISTEC ainda não foi aplicada no Supabase. Aplique supabase/migrations/20261023100000_dossie_sistec.sql e recarregue o painel.'
}
