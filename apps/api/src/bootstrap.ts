import bcrypt from "bcryptjs";
import { registerSchema } from "@slp/shared";
import { config } from "./config";
import { seedDomains } from "./domains/seed";
import { logger } from "./logger";
import { User } from "./models/User";
import { seedOpportunities } from "./opportunities/seed";

/**
 * First-run setup for hosts with no shell (a free Render service has none), driven entirely by environment variables:
 *  - AUTO_SEED=true seeds the 12 domains and the opportunity list. Both are idempotent and never overwrite admin edits.
 *  - BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD create the first admin, only while no admin exists. After that they are
 *    ignored, so the password can (and should) be removed from the environment once you have signed in.
 * Failures are logged, never thrown: the API should still start and serve students.
 */
export async function bootstrap(
  opts: { autoSeed?: boolean; adminEmail?: string; adminPassword?: string } = config.bootstrap,
) {
  if (opts.autoSeed) {
    try {
      const d = await seedDomains();
      logger.info({ created: d.created.length }, "bootstrap: domains seeded");
      const o = await seedOpportunities();
      logger.info(
        { created: o.created, embedded: o.embedded, skipped: o.skipped.length },
        "bootstrap: opportunities seeded",
      );
      if (o.created > 0 && o.embedded === 0) {
        logger.warn(
          "bootstrap: opportunities saved without vectors (ML service not reachable yet); matching uses keywords until POST /admin/opportunities/reembed is called",
        );
      }
    } catch (e) {
      logger.error({ err: (e as Error).message }, "bootstrap: seeding failed");
    }
  }

  if (opts.adminEmail || opts.adminPassword) {
    try {
      if (!opts.adminEmail || !opts.adminPassword) {
        throw new Error("set both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD");
      }
      if (await User.exists({ role: "admin" })) {
        logger.info("bootstrap: an admin already exists, ignoring BOOTSTRAP_ADMIN_*");
        return;
      }
      // Same rules as sign-up, so a weak bootstrap password is refused rather than quietly accepted.
      const input = registerSchema.parse({
        email: opts.adminEmail,
        name: "Administrator",
        password: opts.adminPassword,
      });
      await User.create({
        name: input.name,
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, config.bcryptRounds),
        role: "admin",
      });
      logger.info({ email: input.email }, "bootstrap: first admin created");
    } catch (e) {
      logger.error({ err: (e as Error).message }, "bootstrap: could not create the admin");
    }
  }
}
