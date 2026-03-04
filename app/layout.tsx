import "./globals.css";
import TopNav from "./components/TopNav";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <TopNav />
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: 18 }}>{children}</div>
      </body>
    </html>
  );
}