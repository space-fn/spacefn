import { defineCron } from "spacefn/crons";

export default defineCron("0 3 * * *", async (event) => {
	console.log("NIGHTLY RAN", event.cron);
});
