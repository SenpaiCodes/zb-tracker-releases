// Regression tests for the screenshot reader's parsing rules.
//
// These run against text actually produced by Tesseract on real platform
// screenshots — mangled labels, dropped decimal points and all — so they pin the
// behaviour that took the most tuning to get right.
//
//   npm test

import assert from "node:assert/strict";
import test from "node:test";
import { parseRecognizedText, parseMoney } from "../src/lib/ocr.ts";

// Captured from public/fixtures/full.png — a Tradesea window inside a browser.
const TRADESEA = {
  toolbar:
    "yD rRel: |  Reyle DP rReyl:  relay  E8 Mar: & | ) in ER | QB Mye\n" +
    " & ttys://ay.traesea.ai/trae\n\n" +
    "                       DEMo\n\n" +
    "e | anaor ) Deno Aeeount      Bal $88,591.75    PPAL -$88       UPAL $--\n",
  table:
    "Accounts _ Ordese==\"ositfons pSpark      Market cOS3   @as:a6 0    32\n" +
    "Open                                                              Q\n" +
    ">)    ben ti          Ent          ‘     et Pat      arge      A\n" +
    "r )        (08/30/2026, 20:56:04 POT      08/30/2026, 20:56:07 PDT      CME:MNQ      9      Short      $29,348.47      $29,346.86      -$56.50      $13.50      @\n" +
    "08/30/2026, 20:51:35 PDT      08/30/2026, 20:51:38 PDT      CME:MNQ      9      Short      $29,343.17      $29,344.17      -$3150      $13.50      @\n",
  full: "",
};

// Captured from public/fixtures/toolbar.png — a tight crop of just the toolbar.
const TOOLBAR_ONLY = {
  toolbar: "Pa| $88,591.75     nP2l -$88\n",
  table: "",
  full: "",
};

test("reads the day's net from a mangled RP&L label", () => {
  const r = parseRecognizedText(TOOLBAR_ONLY);
  // `nP2l` is what OCR makes of `RP&L`; it still has to resolve to the net.
  assert.equal(r.net, -88);
});

test("reads net, record, contracts and both trade rows from a full screenshot", () => {
  const r = parseRecognizedText(TRADESEA);

  assert.equal(r.net, -88);
  assert.equal(r.balance, 88591.75);
  assert.equal(r.wins, 0);
  assert.equal(r.losses, 2);
  assert.equal(r.contracts, 18);
  assert.equal(r.date, "2026-08-30");
  assert.equal(r.trades.length, 2);
  assert.ok(r.reconciled, "rows should reconcile against the toolbar figure");
});

test("repairs a P&L whose decimal point was dropped", () => {
  const r = parseRecognizedText(TRADESEA);
  // The second row is recognized as `-$3150`; only the toolbar total reveals
  // that it is really -$31.50.
  assert.deepEqual(
    r.trades.map((t) => t.pnl),
    [-56.5, -31.5],
  );
});

test("keeps side, symbol and size off each row", () => {
  const { trades } = parseRecognizedText(TRADESEA);
  for (const t of trades) {
    assert.equal(t.side, "SHORT");
    assert.equal(t.symbol, "MNQ");
    assert.equal(t.size, 9);
  }
  assert.deepEqual(
    trades.map((t) => t.time),
    ["20:56", "20:51"],
  );
});

test("never mistakes unrealized P&L for the day's result", () => {
  // UP&L is the open-position figure; reporting it as the day's net would be a
  // real error, and `UPAL` is one edit away from `RPAL`.
  const r = parseRecognizedText({
    toolbar: "Bal $50,000.00   UPAL -$400   RPAL $250",
    table: "",
    full: "",
  });
  assert.equal(r.net, 250);
});

test("does not read the account balance as the P&L", () => {
  const r = parseRecognizedText({
    toolbar: "Bal $88,591.75",
    table: "",
    full: "",
  });
  assert.equal(r.net, null);
  assert.equal(r.balance, 88591.75);
});

test("falls back to the trade rows when no toolbar figure is readable", () => {
  const r = parseRecognizedText({
    toolbar: "nothing useful here",
    table:
      "09/02/2026, 10:14:00 EDT  09/02/2026, 10:22:00 EDT  CME:MES  4  Long  $6,410.25  $6,415.25  $100.00  $5.60\n",
    full: "",
  });
  assert.equal(r.net, 100);
  assert.equal(r.wins, 1);
  assert.equal(r.losses, 0);
  assert.equal(r.contracts, 4);
  assert.equal(r.reconciled, false);
});

test("infers a missing minus sign from the trade's direction", () => {
  // No sign on the P&L, but a long that exits below its entry lost money.
  const r = parseRecognizedText({
    toolbar: "",
    table:
      "09/02/2026, 10:14:00 EDT  09/02/2026, 10:22:00 EDT  CME:MES  2  Long  $6,415.25  $6,410.25  $50.00  $2.80\n",
    full: "",
  });
  assert.equal(r.trades[0].pnl, -50);
});

test("parseMoney handles the formats platforms actually print", () => {
  assert.equal(parseMoney("$88,591.75"), 88591.75);
  assert.equal(parseMoney("-$56.50"), -56.5);
  assert.equal(parseMoney("(1,234.50)"), -1234.5);
  assert.equal(parseMoney("$ 88"), 88);
  assert.equal(parseMoney("$--"), null);
  assert.equal(parseMoney("abc"), null);
});
