import * as React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "../src/components/ui/select";
import { whatsappEntry, WHATSAPP_QR_NUMBER } from "../src/lib/whatsapp";

test("WhatsApp requires a valid international number and never invents a destination", () => {
  for (const value of [undefined, "", "   ", "03001234567", "abc", "https://wa.me/123", "1234567890123456"]) {
    assert.equal(whatsappEntry(value), null);
  }
  assert.deepEqual(whatsappEntry(`+${WHATSAPP_QR_NUMBER}`), {
    url: `https://wa.me/${WHATSAPP_QR_NUMBER}`,
    hasMatchingQr: true,
  });
  assert.equal(whatsappEntry("+92 (355) 583-1500")?.hasMatchingQr, true);
  assert.equal(whatsappEntry("15555550123")?.hasMatchingQr, false);
});

function selectedMarkup(value: string | null, label = "Pharmacy", items?: Record<string, React.ReactNode>) {
  return renderToStaticMarkup(
    <Select value={value} items={items}>
      <SelectTrigger><SelectValue placeholder="Choose a counter" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all" label="All counters">All counters</SelectItem>
        <SelectGroup>
          <>
            {[{ id: "42", name: label }].map((counter) => (
              <SelectItem key={counter.id} value={counter.id} label={counter.name}>
                A longer option description
              </SelectItem>
            ))}
            <SelectItem value="73">Admissions</SelectItem>
          </>
        </SelectGroup>
      </SelectContent>
    </Select>,
  );
}

test("closed selects display labels before their options mount, not numeric IDs", () => {
  assert.match(selectedMarkup("42"), />Pharmacy<\/span>/);
  assert.doesNotMatch(selectedMarkup("42"), />42<\/span>/);
  assert.match(selectedMarkup("73"), />Admissions<\/span>/);
  assert.match(selectedMarkup("all"), />All counters<\/span>/);
  assert.match(selectedMarkup(null), />Choose a counter<\/span>/);
});

test("updated option names and explicit Base UI items mappings are respected", () => {
  assert.match(selectedMarkup("42", "Renamed counter"), />Renamed counter<\/span>/);
  assert.match(selectedMarkup("42", "Pharmacy", { "42": "Explicit label" }), />Explicit label<\/span>/);
});

test("numeric values and multi-select labels retain Base UI semantics", () => {
  const html = renderToStaticMarkup(
    <Select multiple value={[42, 73]}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={42}>Pharmacy</SelectItem>
        <SelectItem value={73}>Admissions</SelectItem>
      </SelectContent>
    </Select>,
  );
  assert.match(html, /Pharmacy/);
  assert.match(html, /Admissions/);
  assert.doesNotMatch(html, />42, 73</);
});
