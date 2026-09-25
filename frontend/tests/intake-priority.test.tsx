import * as React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyIntake, intakePayload, IntakeFields } from "../src/components/tokens/intake-fields";
import { PriorityReview } from "../src/components/tokens/priority-review";
import { PublicPriority } from "../src/components/tokens/public-priority";
import { apiErrorMessage } from "../src/lib/api-client";
import type { Token } from "../src/types";

test("public intake requires exact ASCII CNIC without truncating or normalizing it", () => {
  for (const customer_cnic of ["", "123", "00000000000012", "00000-0000000", " 000000000001", "１２３４５６７８９０１２３", "١٢٣٤٥٦٧٨٩٠١٢٣"]) {
    assert.throws(() => intakePayload({ ...emptyIntake, customer_cnic, referral_source: "website" }, true, true), /13 ASCII digits/);
  }
  assert.equal(intakePayload({ ...emptyIntake, customer_cnic: "0000000000001", referral_source: "website" }, true, true).customer_cnic, "0000000000001");
  assert.throws(() => intakePayload({ ...emptyIntake, customer_cnic: "0000000000001" }, true, false), /referring organization/);
});

test("admin intake is optional; other organization requires a bounded nonblank name", () => {
  assert.deepEqual(intakePayload(emptyIntake, false, false), {
    customer_cnic: null, referral_source: null, referral_organization: null,
    requested_priority: "normal", priority_reason: null,
  });
  for (const required of [true, false]) {
    for (const referral_organization of ["", "  ", "x".repeat(256)]) {
      assert.throws(() => intakePayload({ ...emptyIntake, customer_cnic: "0000000000001", referral_source: "other", referral_organization }, required, true));
    }
  }
  assert.equal(intakePayload({ ...emptyIntake, referral_source: "other", referral_organization: " Partner " }, false, false).referral_organization, "Partner");
  for (const referral_source of ["website", "institution"] as const) {
    assert.equal(intakePayload({ ...emptyIntake, referral_source, referral_organization: "stale" }, false, false).referral_organization, null);
  }
});

test("only hospitals submit accessibility requests, never effective priority", () => {
  for (const priority_reason of ["elderly", "disability"] as const) {
    const hospital = intakePayload({ ...emptyIntake, priority_reason }, false, true);
    assert.equal(hospital.requested_priority, "accessibility");
    assert.equal(hospital.priority_reason, priority_reason);
    assert.equal("effective_priority" in hospital, false);
    assert.equal(intakePayload({ ...emptyIntake, priority_reason }, false, false).priority_reason, null);
    assert.equal(intakePayload({ ...emptyIntake, priority_reason }, false, false).requested_priority, "normal");
  }
});

const token = { id: 7, position: 4, status: "waiting", requested_priority: "accessibility", effective_priority: "normal", priority_reason: "elderly", priority_review: "pending" } as Token;
test("public priority displays review and effective state without sensitive reason", () => {
  for (const priority_review of ["pending", "approved", "rejected", "normal", "not_requested"] as const) {
    const html = renderToStaticMarkup(<PublicPriority ticket={{ ...token, priority_review }} />);
    assert.match(html, /Effective priority: normal/);
    assert.doesNotMatch(html, /elderly|disability|customer_cnic/);
    assert.match(html, new RegExp(priority_review === "normal" ? "returned to normal" : priority_review === "not_requested" ? "No accessibility" : priority_review));
  }
});
test("review markup shows pending versus effective priority and only waiting hospital actions", () => {
  const render = (item: Token, hospital = true) => renderToStaticMarkup(<PriorityReview token={item} hospital={hospital} onDone={() => {}} />);
  const html = render(token);
  assert.match(html, /Pending verification/);
  assert.match(html, /Effective: normal/);
  assert.match(html, /normal queue order/);
  assert.match(html, /Not clinical triage/);
  assert.match(html, /Approve accessibility/);
  assert.equal(render(token, false), "");
  for (const status of ["called", "in_service", "served", "declined", "no_show"] as const) {
    assert.doesNotMatch(render({ ...token, status }), /<button/);
  }
  assert.doesNotMatch(render({ ...token, requested_priority: "normal" }), /<button/);
});

test("public required fields and hospital-only request selector are accessible", () => {
  const html = renderToStaticMarkup(<IntakeFields value={emptyIntake} onChange={() => {}} required hospital={false} institutionName="Bank" />);
  assert.match(html, /pattern="\[0-9\]\{13\}"/);
  assert.match(html, /required=""/);
  assert.doesNotMatch(html, /Accessibility priority request/);
  assert.doesNotMatch(html, /maxLength="13"/);
});

test("API errors parse once, format validation messages, and exclude submitted PII", async () => {
  assert.equal(await apiErrorMessage(Response.json({ detail: "Token is called, expected waiting" }), "fallback"), "Token is called, expected waiting");
  const message = await apiErrorMessage(Response.json({ detail: [{ loc: ["body", "customer_cnic"], msg: "Must contain 13 digits", input: "private-value", ctx: { secret: "private-value" } }] }), "fallback");
  assert.equal(message, "customer_cnic: Must contain 13 digits");
  assert.doesNotMatch(message, /private-value/);
  assert.equal(await apiErrorMessage(new Response("<html>Internal error</html>"), "fallback"), "fallback");
});
