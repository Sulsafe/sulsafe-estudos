


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    INSERT INTO public.profiles (id, email, nome_completo, role, status)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'nome_completo', 'Usuário'),
        'aluno',
        'pendente'
    );
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."certificados" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid",
    "nr_id" integer NOT NULL,
    "codigo" "text",
    "nota" numeric(5,2),
    "carga_horaria" integer DEFAULT 40,
    "emitido_por" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."certificados" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."materiais" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nr_id" integer NOT NULL,
    "titulo" "text" NOT NULL,
    "descricao" "text",
    "url" "text",
    "tipo" "text" DEFAULT 'arquivo'::"text",
    "criado_por" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."materiais" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mensagens_forum" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid",
    "nr_id" integer,
    "topico" "text" NOT NULL,
    "mensagem" "text" NOT NULL,
    "status" "text" DEFAULT 'aberta'::"text",
    "criado_em" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."mensagens_forum" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid",
    "nr_id" integer NOT NULL,
    "nota" numeric(5,2),
    "obs" "text",
    "professor_id" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notificacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid",
    "titulo" "text" NOT NULL,
    "mensagem" "text" NOT NULL,
    "link" "text",
    "lida" boolean DEFAULT false,
    "criado_em" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notificacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "role" "text" DEFAULT 'aluno'::"text",
    "status" "text" DEFAULT 'pendente'::"text",
    "criado_em" timestamp with time zone DEFAULT "now"(),
    "nome_completo" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."progresso_aulas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "aula_id" "uuid",
    "assistiu_segundos" integer DEFAULT 0,
    "concluído" boolean DEFAULT false,
    "ultima_atualizacao" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."progresso_aulas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid",
    "nr_id" integer NOT NULL,
    "titulo" "text",
    "arquivo_url" "text",
    "status" "text" DEFAULT 'pendente'::"text",
    "nota" numeric(5,2),
    "corrigido_em" timestamp with time zone,
    "criado_em" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."provas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."salas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topico" "text" NOT NULL,
    "meet_id" "text" NOT NULL,
    "criado_por" "uuid",
    "ativa" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."salas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."videoaulas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nr_id" integer NOT NULL,
    "titulo" "text" NOT NULL,
    "descricao" "text",
    "url_video" "text",
    "ordem" integer DEFAULT 0,
    "criado_em" timestamp with time zone DEFAULT "now"(),
    "atualizado_em" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."videoaulas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_dashboard_admin" AS
 SELECT ( SELECT "count"(*) AS "count"
           FROM "public"."profiles") AS "total_usuarios",
    ( SELECT "count"(*) AS "count"
           FROM "public"."profiles"
          WHERE ("profiles"."role" = 'aluno'::"text")) AS "total_alunos",
    ( SELECT "count"(*) AS "count"
           FROM "public"."profiles"
          WHERE ("profiles"."role" = 'professor'::"text")) AS "total_professores",
    ( SELECT "count"(*) AS "count"
           FROM "public"."profiles"
          WHERE ("profiles"."status" = 'pendente'::"text")) AS "pendentes",
    ( SELECT "count"(*) AS "count"
           FROM "public"."provas"
          WHERE ("provas"."status" = 'pendente'::"text")) AS "provas_pendentes",
    ( SELECT "count"(*) AS "count"
           FROM "public"."progresso_aulas"
          WHERE ("progresso_aulas"."concluído" = true)) AS "total_concluidas";


ALTER VIEW "public"."view_dashboard_admin" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_medias_nrs" AS
 SELECT "usuario_id",
    "nr_id",
    "avg"("nota") AS "media",
    "count"("id") AS "total_avaliacoes"
   FROM "public"."notas"
  GROUP BY "usuario_id", "nr_id";


ALTER VIEW "public"."view_medias_nrs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_ranking_alunos" AS
 SELECT "p"."id",
    "p"."nome_completo",
    "p"."email",
    "count"("pr"."id") AS "aulas_concluidas",
    COALESCE(((("count"(
        CASE
            WHEN "pr"."concluído" THEN 1
            ELSE NULL::integer
        END))::numeric * 100.0) / (NULLIF(( SELECT "count"(*) AS "count"
           FROM "public"."videoaulas"), 0))::numeric), (0)::numeric) AS "progresso"
   FROM ("public"."profiles" "p"
     LEFT JOIN "public"."progresso_aulas" "pr" ON (("p"."id" = "pr"."user_id")))
  WHERE ("p"."role" = 'aluno'::"text")
  GROUP BY "p"."id", "p"."nome_completo", "p"."email";


ALTER VIEW "public"."view_ranking_alunos" OWNER TO "postgres";


ALTER TABLE ONLY "public"."certificados"
    ADD CONSTRAINT "certificados_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."certificados"
    ADD CONSTRAINT "certificados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."materiais"
    ADD CONSTRAINT "materiais_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mensagens_forum"
    ADD CONSTRAINT "mensagens_forum_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notas"
    ADD CONSTRAINT "notas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notificacoes"
    ADD CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."progresso_aulas"
    ADD CONSTRAINT "progresso_aulas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."progresso_aulas"
    ADD CONSTRAINT "progresso_aulas_user_id_aula_id_key" UNIQUE ("user_id", "aula_id");



ALTER TABLE ONLY "public"."provas"
    ADD CONSTRAINT "provas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."salas"
    ADD CONSTRAINT "salas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."videoaulas"
    ADD CONSTRAINT "videoaulas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."certificados"
    ADD CONSTRAINT "certificados_emitido_por_fkey" FOREIGN KEY ("emitido_por") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."certificados"
    ADD CONSTRAINT "certificados_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."materiais"
    ADD CONSTRAINT "materiais_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."mensagens_forum"
    ADD CONSTRAINT "mensagens_forum_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notas"
    ADD CONSTRAINT "notas_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."notas"
    ADD CONSTRAINT "notas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notificacoes"
    ADD CONSTRAINT "notificacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progresso_aulas"
    ADD CONSTRAINT "progresso_aulas_aula_id_fkey" FOREIGN KEY ("aula_id") REFERENCES "public"."videoaulas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progresso_aulas"
    ADD CONSTRAINT "progresso_aulas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provas"
    ADD CONSTRAINT "provas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."salas"
    ADD CONSTRAINT "salas_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."profiles"("id");



CREATE POLICY "Admin atualiza perfis" ON "public"."profiles" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admin gerencia perfis" ON "public"."profiles" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "profiles_1"
  WHERE (("profiles_1"."id" = "auth"."uid"()) AND ("profiles_1"."role" = 'admin'::"text")))));



CREATE POLICY "Admin lê todos os perfis" ON "public"."profiles" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Leitura para autenticados" ON "public"."certificados" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Leitura para autenticados" ON "public"."materiais" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Leitura para autenticados" ON "public"."mensagens_forum" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Leitura para autenticados" ON "public"."notas" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Leitura para autenticados" ON "public"."notificacoes" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Leitura para autenticados" ON "public"."progresso_aulas" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Leitura para autenticados" ON "public"."provas" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Leitura para autenticados" ON "public"."salas" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Leitura para autenticados" ON "public"."videoaulas" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Usuário lê próprio perfil" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Usuário vê próprio perfil" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."certificados" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."materiais" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mensagens_forum" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notificacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."progresso_aulas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."salas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."videoaulas" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON TABLE "public"."certificados" TO "anon";
GRANT ALL ON TABLE "public"."certificados" TO "authenticated";
GRANT ALL ON TABLE "public"."certificados" TO "service_role";



GRANT ALL ON TABLE "public"."materiais" TO "anon";
GRANT ALL ON TABLE "public"."materiais" TO "authenticated";
GRANT ALL ON TABLE "public"."materiais" TO "service_role";



GRANT ALL ON TABLE "public"."mensagens_forum" TO "anon";
GRANT ALL ON TABLE "public"."mensagens_forum" TO "authenticated";
GRANT ALL ON TABLE "public"."mensagens_forum" TO "service_role";



GRANT ALL ON TABLE "public"."notas" TO "anon";
GRANT ALL ON TABLE "public"."notas" TO "authenticated";
GRANT ALL ON TABLE "public"."notas" TO "service_role";



GRANT ALL ON TABLE "public"."notificacoes" TO "anon";
GRANT ALL ON TABLE "public"."notificacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."notificacoes" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."progresso_aulas" TO "anon";
GRANT ALL ON TABLE "public"."progresso_aulas" TO "authenticated";
GRANT ALL ON TABLE "public"."progresso_aulas" TO "service_role";



GRANT ALL ON TABLE "public"."provas" TO "anon";
GRANT ALL ON TABLE "public"."provas" TO "authenticated";
GRANT ALL ON TABLE "public"."provas" TO "service_role";



GRANT ALL ON TABLE "public"."salas" TO "anon";
GRANT ALL ON TABLE "public"."salas" TO "authenticated";
GRANT ALL ON TABLE "public"."salas" TO "service_role";



GRANT ALL ON TABLE "public"."videoaulas" TO "anon";
GRANT ALL ON TABLE "public"."videoaulas" TO "authenticated";
GRANT ALL ON TABLE "public"."videoaulas" TO "service_role";



GRANT ALL ON TABLE "public"."view_dashboard_admin" TO "anon";
GRANT ALL ON TABLE "public"."view_dashboard_admin" TO "authenticated";
GRANT ALL ON TABLE "public"."view_dashboard_admin" TO "service_role";



GRANT ALL ON TABLE "public"."view_medias_nrs" TO "anon";
GRANT ALL ON TABLE "public"."view_medias_nrs" TO "authenticated";
GRANT ALL ON TABLE "public"."view_medias_nrs" TO "service_role";



GRANT ALL ON TABLE "public"."view_ranking_alunos" TO "anon";
GRANT ALL ON TABLE "public"."view_ranking_alunos" TO "authenticated";
GRANT ALL ON TABLE "public"."view_ranking_alunos" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
