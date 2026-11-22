import { middleware } from "spacefn";

import * as Shops from "#modules/shops/shops.ts";

// Every page under /s/:shop/ runs on that shop's own database.
export default middleware(Shops.provideShopDb);
