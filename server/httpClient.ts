import {
  Agent,
  setGlobalDispatcher,
} from "undici";

/*
  Node's built-in fetch uses Undici.

  Adobe occasionally takes longer than
  Undici's default 10-second connection
  timeout on some Windows/network setups.
*/
const adobeHttpAgent = new Agent({
  connectTimeout: 60_000,
  headersTimeout: 300_000,
  bodyTimeout: 300_000,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 120_000,
  autoSelectFamily: true,
  autoSelectFamilyAttemptTimeout: 1_000,
});

setGlobalDispatcher(adobeHttpAgent);
