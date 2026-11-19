import { csrf } from "spacefn";

// Refuses cross-site form posts and Datastar requests.
export default csrf();
