import { baseFiles, indexCss, type ThemeVars } from "./shared";

export const SHOP_THEME: ThemeVars = {
  bg: "#fff7f4",
  surface: "#ffffff",
  ink: "#3a241e",
  accent: "#ff5c39",
  radius: 16,
  font: "system-ui, -apple-system, sans-serif",
};

const PRODUCTS_TS =
  "export interface Product {\n" +
  "  id: string;\n" +
  "  name: string;\n" +
  "  price: number;\n" +
  "  blurb: string;\n" +
  "}\n" +
  "\n" +
  "export const PRODUCTS: Product[] = [\n" +
  '  { id: "mug", name: "Camp mug", price: 18, blurb: "Enamel, 350ml, campfire-proof." },\n' +
  '  { id: "tote", name: "Canvas tote", price: 24, blurb: "Heavy canvas, fits a laptop." },\n' +
  '  { id: "cap", name: "Wool cap", price: 32, blurb: "Warm, one size, three colors." },\n' +
  "];\n";

const APP_TSX =
  'import { useMemo, useState } from "react";\n' +
  'import { PRODUCTS } from "./products";\n' +
  "\n" +
  "export default function App() {\n" +
  "  const [cart, setCart] = useState<Record<string, number>>({});\n" +
  "  const [done, setDone] = useState(false);\n" +
  "  const lines = PRODUCTS.filter((p) => (cart[p.id] ?? 0) > 0);\n" +
  "  const total = useMemo(() => lines.reduce((sum, p) => sum + p.price * (cart[p.id] ?? 0), 0), [lines, cart]);\n" +
  "  function add(id: string) {\n" +
  "    setDone(false);\n" +
  "    setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));\n" +
  "  }\n" +
  "  return (\n" +
  "    <main>\n" +
  "      <h1>Corner shop</h1>\n" +
  '      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>\n' +
  "        {PRODUCTS.map((p) => (\n" +
  '          <article key={p.id} className="card">\n' +
  "            <h2>{p.name}</h2>\n" +
  "            <p>{p.blurb}</p>\n" +
  "            <p><strong>{p.price}$</strong></p>\n" +
  '            <button type="button" onClick={() => add(p.id)}>Add to cart</button>\n' +
  "          </article>\n" +
  "        ))}\n" +
  "      </section>\n" +
  '      <section className="card" style={{ marginTop: 16 }} aria-live="polite">\n' +
  "        <h2>Cart ({lines.reduce((n, p) => n + (cart[p.id] ?? 0), 0)})</h2>\n" +
  "        {lines.length === 0 && <p>Empty — add something tasty.</p>}\n" +
  "        {lines.map((p) => (\n" +
  '          <p key={p.id}>{p.name} × {cart[p.id]} — {p.price * (cart[p.id] ?? 0)}$</p>\n' +
  "        ))}\n" +
  "        {lines.length > 0 && <p><strong>Total: {total}$</strong></p>}\n" +
  "        {done && <p role=\"status\">Order placed. This demo stores nothing.</p>}\n" +
  '        <button type="button" disabled={lines.length === 0} onClick={() => { setCart({}); setDone(true); }}>Checkout</button>\n' +
  "      </section>\n" +
  "    </main>\n" +
  "  );\n" +
  "}\n";

export function files(name: string): Record<string, string> {
  const base = baseFiles(name, APP_TSX, indexCss(SHOP_THEME));
  base["src/products.ts"] = PRODUCTS_TS;
  return base;
}
