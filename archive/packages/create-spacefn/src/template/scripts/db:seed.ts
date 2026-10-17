import { defineCmd, log } from "@spacefn/cli";

export default defineCmd({
  meta: { name: "db:seed", description: "Seed the database" },
  args: {
    count: { type: "number", description: "Number of records", default: 10 },
  },
  async run({ args }) {
    log.info(`Seeding ${args.count} records...`);
    // Add your seed logic here
    log.success("Done!");
  },
});
