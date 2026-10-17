import "./globals.css";
export const metadata = { title: "FundFlow", description: "AI grant copilot for NGOs" };
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
export default function RootLayout({ children }) {
  return (<html lang="en"><body>{children}</body></html>);
}
