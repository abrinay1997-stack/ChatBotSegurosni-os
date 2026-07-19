// Resolución de la base de datos para tests de integración.
//
// REGLA DE ORO: los tests de DB SOLO corren contra DATABASE_URL_TEST, nunca
// contra DATABASE_URL (producción). Antes el fallback `?? DATABASE_URL` hacía
// que `npm test` sin DATABASE_URL_TEST escribiera sesiones y filas en la base
// real — se colaron ~194 sesiones basura en producción por eso
// (ver docs/errors-learned.md 2026-07-19).
//
// - Si DATABASE_URL_TEST no está seteada -> los tests de DB se SALTAN
//   (describe.skipIf(!hasTestDb)), con un aviso. `npm test` sigue pasando
//   para el resto, y NUNCA se toca producción.
// - Si por error DATABASE_URL_TEST == DATABASE_URL -> se aborta con throw,
//   para que una mala configuración no pase desapercibida.

const testUrl = process.env.DATABASE_URL_TEST ?? "";
const prodUrl = process.env.DATABASE_URL ?? "";

if (testUrl && prodUrl && testUrl === prodUrl) {
  throw new Error(
    "DATABASE_URL_TEST es idéntica a DATABASE_URL (producción). Abortado: " +
    "los tests de integración no deben correr contra la base real. Usá una " +
    "base/branch de test aparte (ej. un branch de Neon).",
  );
}

// Defensa en profundidad: `.env.test` está gitignored, así que este chequeo en
// código es la única barrera que viaja con el repo. La base de test DEBE tener
// "test" en el nombre. Si alguien vuelve a apuntar DATABASE_URL_TEST a `neondb`
// (producción), los tests abortan en vez de contaminar la base real — que fue
// exactamente lo que pasó (ver docs/errors-learned.md 2026-07-19).
if (testUrl) {
  let dbName = "";
  try {
    dbName = new URL(testUrl).pathname.replace(/^\//, "");
  } catch {
    throw new Error("DATABASE_URL_TEST no es una URL válida de Postgres.");
  }
  if (!dbName.toLowerCase().includes("test")) {
    throw new Error(
      `DATABASE_URL_TEST apunta a la base "${dbName}", que no parece de test ` +
      `(su nombre no contiene "test"). Abortado por seguridad: usá una base ` +
      `dedicada como "neondb_test". Nunca corras los tests contra producción.`,
    );
  }
}

export const TEST_DB_URL = testUrl;
export const hasTestDb = testUrl.length > 0;

if (!hasTestDb) {
  // eslint-disable-next-line no-console
  console.warn(
    "[tests] DATABASE_URL_TEST no seteada — se saltan los tests de integración " +
    "con Postgres. (No se usa la base de producción como fallback.)",
  );
}
