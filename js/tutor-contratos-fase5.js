// ============================================================
// CONTRATOS ZOD DA FASE 5 — ADAPTADOR NODE
// ============================================================
// No futuro a Edge Function usará o mesmo núcleo com npm:zod (4.6.7, sem
// vulnerabilidades conhecidas). Aqui o Node usa o pacote fixado no projeto.
// ============================================================

import { z } from 'zod'
import { criarContratosFase5, TIPOS_FASE5 } from './tutor-contratos-fase5-core.js'

export const {
    alternativaSchema,
    questaoSchema,
    provaSchema,
    provaComQuestoesSchema,
    moduloSchema,
    palestraSchema,
    validarSaidaIA,
    mensagemPtBR
} = criarContratosFase5(z)

export { TIPOS_FASE5 }
