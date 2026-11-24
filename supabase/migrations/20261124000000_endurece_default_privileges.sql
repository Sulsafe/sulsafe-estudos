-- ============================================================
-- ENDURECIMENTO DOS DEFAULT PRIVILEGES
-- ============================================================
-- O schema-base.sql antigo concedia GRANT ALL em objetos FUTUROS para
-- anon, authenticated e service_role. Isso significa que qualquer migration
-- nova que esquecesse de ENABLE RLS + REVOKE já nascia exposta ao público.
--
-- Esta migration corrige a causa raiz: objetos futuros criados em public
-- não herdam mais acesso para anon/authenticated. Apenas service_role
-- (uso restrito a Edge Functions/backend) mantém o acesso operacional.
--
-- Não altera grants de tabelas já existentes: esses são tratados
-- individualmente pelas migrations de RLS e verificados por tests/.

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on types from anon, authenticated;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
alter default privileges in schema public grant all on types to service_role;

-- Registro da decisão para auditoria.
comment on schema public is
    'Schema da SulSafe. Objetos novos exigem RLS e grants explícitos: anon/authenticated não herdam acesso automático (migration 20261124000000).';
