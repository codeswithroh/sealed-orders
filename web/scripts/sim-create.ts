import { BN } from "@coral-xyz/anchor";
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import fs from "node:fs";
import os from "node:os";
import { allPdas, BASE_RPC, programFor } from "../src/lib/chain";
(async () => {
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(os.homedir() + "/.config/solana/id.json", "utf8"))));
  const base = new Connection(BASE_RPC, "confirmed");
  const id = new BN(Date.now());
  const p = allPdas(id);
  const program = programFor(base, payer);
  const ix = await program.methods.createGame(id, Keypair.generate().publicKey, true, 0)
    .accountsPartial({ game: p.game, army: p.army0, intel: p.intel0, payer: payer.publicKey }).instruction();
  const tx = new Transaction().add(ix);
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await base.getLatestBlockhash()).blockhash;
  tx.sign(payer);
  const sim = await base.simulateTransaction(tx);
  console.log(JSON.stringify(sim.value.err), sim.value.unitsConsumed);
  console.log(sim.value.logs?.join("\n"));
})();
